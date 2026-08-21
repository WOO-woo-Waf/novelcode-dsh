import { readFile, realpath } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
import {
  compileBranchBlueprint,
  type BranchBlueprintCompilation,
} from "@novelcode-dsh/blueprint-compiler"
import type { NarrativeToolInput } from "@novelcode-dsh/contracts"
import {
  createBranchProposalSeed,
  simulateBranch,
  type BranchSimulationResult,
} from "@novelcode-dsh/simulation"
import {
  compileApprovedRevisionStateCandidates,
  type ApprovedRevisionStateCompilation,
} from "@novelcode-dsh/state-recorder"
import { loadConfirmedMemorySnapshot, type ConfirmedMemorySnapshot } from "./snapshot.js"
import {
  BRANCH_BLUEPRINT_ORCHESTRATION_SCHEMA,
  STATE_CANDIDATES_ORCHESTRATION_SCHEMA,
  type ApprovedRevisionStateOrchestrationEnvelope,
  type BranchBlueprintOrchestrationEnvelope,
} from "./types.js"

const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024

export interface WorkspaceBranchCompilation {
  snapshot: ConfirmedMemorySnapshot
  simulation: BranchSimulationResult
  compilation: BranchBlueprintCompilation
}

export function orchestrationSchema(payload: Readonly<Record<string, unknown>>): string | undefined {
  return typeof payload.schema === "string" ? payload.schema : undefined
}

export async function resolveWorkspacePayload(
  input: Pick<NarrativeToolInput, "payload" | "payload_path">,
  workspace: string,
): Promise<Record<string, unknown>> {
  const inline = input.payload === undefined ? {} : requiredRecord(input.payload, "payload")
  if (input.payload_path === undefined) return withoutConfirmation(inline)
  const root = await realpath(workspace)
  const selected = isAbsolute(input.payload_path) ? resolve(input.payload_path) : resolve(root, input.payload_path)
  assertInside(root, selected, "payload_path")
  const canonical = await realpath(selected)
  assertInside(root, canonical, "resolved payload_path")
  const text = await readFile(canonical, "utf8")
  if (Buffer.byteLength(text, "utf8") > MAX_PAYLOAD_BYTES) throw new Error("orchestration payload_path exceeds 2 MiB")
  const filePayload = requiredRecord(JSON.parse(text), "payload_path JSON")
  return withoutConfirmation({ ...filePayload, ...inline })
}

export async function compileWorkspaceBranchBlueprint(
  payload: unknown,
  workspace: string,
): Promise<WorkspaceBranchCompilation> {
  const selected = requiredRecord(payload, "branch orchestration payload")
  if (selected.schema !== BRANCH_BLUEPRINT_ORCHESTRATION_SCHEMA) throw new Error("unsupported branch orchestration schema")
  if (selected.baselineEvents !== undefined || selected.baselineKnowledge !== undefined) {
    throw new Error("branch orchestration cannot accept caller-supplied confirmed baseline")
  }
  const envelope = selected as unknown as BranchBlueprintOrchestrationEnvelope
  validateBranchEnvelope(envelope)
  const snapshot = await loadConfirmedMemorySnapshot(workspace)
  const simulation = simulateBranch({
    branch: envelope.branch,
    baselineEvents: snapshot.events,
    baselineKnowledge: snapshot.knowledge,
    candidateEvents: envelope.candidateEvents,
    ...(envelope.candidateKnowledge === undefined ? {} : { candidateKnowledge: envelope.candidateKnowledge }),
    ...(envelope.constraints === undefined ? {} : { constraints: envelope.constraints }),
    throughSequence: envelope.throughSequence,
  })
  if (!simulation.viable) {
    const reasons = simulation.violations.map((item) => item.kind).filter((value, index, all) => all.indexOf(value) === index)
    throw new Error(`branch simulation is non-viable: ${reasons.join(", ") || "unknown violation"}`)
  }
  const seed = createBranchProposalSeed(envelope.branch, simulation)
  return {
    snapshot,
    simulation,
    compilation: compileBranchBlueprint({
      seed,
      simulation,
      currentBaselineCanonHash: snapshot.baselineCanonHash,
      chapter: envelope.chapter,
    }),
  }
}

export async function compileWorkspaceStateCandidates(
  payload: unknown,
  workspace: string,
): Promise<ApprovedRevisionStateCompilation> {
  const selected = requiredRecord(payload, "state orchestration payload")
  if (selected.schema !== STATE_CANDIDATES_ORCHESTRATION_SCHEMA) throw new Error("unsupported state orchestration schema")
  if (selected.workspaceRoot !== undefined) throw new Error("state orchestration cannot override the session workspace")
  const envelope = selected as unknown as ApprovedRevisionStateOrchestrationEnvelope
  validateStateEnvelope(envelope)
  return compileApprovedRevisionStateCandidates({
    workspaceRoot: workspace,
    manifestPath: envelope.manifestPath,
    approvedRevisionPath: envelope.approvedRevisionPath,
    approvedContentSha256: envelope.approvedContentSha256,
    throughStorySequence: envelope.throughStorySequence,
    ...(envelope.storyEvents === undefined ? {} : { storyEvents: envelope.storyEvents }),
    ...(envelope.knowledgeClaims === undefined ? {} : { knowledgeClaims: envelope.knowledgeClaims }),
    ...(envelope.foreshadowDebts === undefined ? {} : { foreshadowDebts: envelope.foreshadowDebts }),
  })
}

function validateBranchEnvelope(value: BranchBlueprintOrchestrationEnvelope): void {
  requiredRecord(value.branch, "branch")
  if (!Array.isArray(value.candidateEvents) || value.candidateEvents.length === 0) {
    throw new Error("branch orchestration requires candidateEvents")
  }
  requiredRecord(value.chapter, "chapter")
  if (!Number.isSafeInteger(value.throughSequence) || value.throughSequence < 0) {
    throw new Error("branch orchestration throughSequence must be a non-negative integer")
  }
}

function validateStateEnvelope(value: ApprovedRevisionStateOrchestrationEnvelope): void {
  requiredString(value.manifestPath, "manifestPath")
  requiredString(value.approvedRevisionPath, "approvedRevisionPath")
  requiredString(value.approvedContentSha256, "approvedContentSha256")
  if (!Number.isSafeInteger(value.throughStorySequence) || value.throughStorySequence < 0) {
    throw new Error("state orchestration throughStorySequence must be a non-negative integer")
  }
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`)
  return value
}

function assertInside(root: string, target: string, label: string): void {
  const selected = relative(root, target)
  if (selected === ".." || selected.startsWith(`..${sep}`) || isAbsolute(selected)) {
    throw new Error(`${label} escapes the novel workspace`)
  }
}

function withoutConfirmation(value: Record<string, unknown>): Record<string, unknown> {
  const { confirmation: _ignored, ...selected } = value
  return selected
}
