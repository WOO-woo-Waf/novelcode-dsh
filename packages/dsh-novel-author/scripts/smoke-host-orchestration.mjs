import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { Context } from "@deepseek-ai/cordis"
import { CallId } from "@deepseek-ai/dsh-llm"
import SystemPrompt from "@deepseek-ai/dsh-system-prompt"
import ToolRuntime from "@deepseek-ai/dsh-tools"
import ApprovalService from "@deepseek-ai/dsh-user-approval"
import {
  NOVELCODE_DSH_WORKSPACE_MARKER,
  NOVELCODE_DSH_WORKSPACE_SCHEMA,
} from "@novelcode-dsh/contracts"
import {
  BRANCH_BLUEPRINT_ORCHESTRATION_SCHEMA,
} from "@novelcode-dsh/host-orchestration"
import NovelService from "../lib/index.js"

const workspace = await mkdtemp(join(tmpdir(), "novelcode-dsh-host-golden-"))
const configuredCoreRoot = process.env.NOVELCODE_DSH_CORE_ROOT
if (!configuredCoreRoot) {
  throw new Error("set NOVELCODE_DSH_CORE_ROOT to a readable Novel Workbench checkout")
}
const coreRoot = resolve(configuredCoreRoot)
const ctx = new Context()
const fibers = []
const sessionEvents = [{ type: "turn/start" }]
const agent = {
  id: "host-golden-session",
  session: {
    header: { cwd: workspace },
    events: sessionEvents,
    append(type, data) {
      const event = { type, data }
      sessionEvents.push(event)
      return event
    },
  },
}
let callIndex = 0

try {
  await markWorkspace()
  fibers.push(await ctx.plugin(SystemPrompt))
  fibers.push(await ctx.plugin(ToolRuntime))
  fibers.push(await ctx.plugin(ApprovalService))
  fibers.push(await ctx.plugin(NovelService, {
    coreRoot,
    bunExecutable: process.env.NOVELCODE_DSH_BUN_EXECUTABLE ?? "bun",
    requestTimeoutMs: 30_000,
    stderrLimitBytes: 8_192,
    approvalTtlMs: 30_000,
  }))
  ctx.on("approval/request", () => Promise.resolve("allowed-once"))

  const before = await ctx.novel.readiness(workspace)
  if (before.running) throw new Error("Host sidecar started before first tool execution")

  await run("narrative_project", {
    action: "narrative_project_init",
    project_id: "host-golden-v1",
    project_title: "Host 编排合成小说",
    language: "zh-CN",
  })
  const baseline = await run("narrative_memory", {
    action: "narrative_memory_propose",
    payload: {
      id: "host-baseline-map",
      title: "Host Baseline Map",
      type: "canon_event",
      layer: "L1",
      body: "Synthetic Memory OS baseline candidate.",
      data: {
        memory_os_schema: "story-event/v1",
        source_lifecycle: "candidate",
        event_type: "map_changed",
        story_time: { sequence: 1 },
        narrative_position: { chapterIndex: 1, order: 1 },
        validity: { fromSequence: 1 },
        participants: ["顾岚"],
        causes: [],
        effects: [{ entityId: "map-a", fieldPath: "coastline", operation: "set", next: "divergent" }],
        evidence_refs: [{ sourceId: "synthetic-host", revisionHash: "fixture-v1", locator: "scene-map" }],
        recorded_at: "2026-08-21T00:00:00Z",
      },
      evidence: ["synthetic-host@fixture-v1#scene-map"],
      tags: ["memory-os", "story-event"],
    },
  })
  const baselineProposalId = requiredString(objectValue(baseline.payload).proposal_id, "baseline proposal_id")
  await run("narrative_memory", {
    action: "narrative_memory_submit_review",
    payload: { proposal_id: baselineProposalId },
  })
  await run("narrative_memory", {
    action: "narrative_memory_confirm",
    payload: { proposal_id: baselineProposalId },
  })

  const consistency = await run("narrative_memory", { action: "narrative_memory_consistency_check" })
  const snapshot = objectValue(objectValue(consistency.payload).memory_os_snapshot)
  const baselineHash = requiredString(snapshot.baseline_canon_hash, "baseline_canon_hash")
  const delta = [{ entityId: "character-gulan", fieldPath: "location", operation: "set", next: "archive" }]
  const branch = await run("narrative_plan", {
    action: "narrative_blueprint_propose",
    payload: {
      schema: BRANCH_BLUEPRINT_ORCHESTRATION_SCHEMA,
      branch: {
        id: "host-branch-archive",
        baselineCanonHash: baselineHash,
        status: "sandbox",
        hypothesis: "顾岚进入档案馆核对变化地图。",
        candidateEventIds: ["host-candidate-enter-archive"],
        stateDelta: delta,
        costs: ["暴露独立调查意图"],
        conflicts: [],
        foreshadowImpacts: ["七码头线索强化"],
      },
      candidateEvents: [{
        id: "host-candidate-enter-archive",
        eventType: "location_changed",
        lifecycle: "candidate",
        storyTime: { sequence: 2 },
        narrativePosition: { chapterIndex: 2, segmentId: "segment-01", order: 2 },
        validity: { fromSequence: 2 },
        participants: ["顾岚"],
        causes: ["host-baseline-map"],
        effects: delta,
        evidence: [{ sourceId: "host-branch", revisionHash: "hypothesis-v1", locator: "segment-01" }],
        recordedAt: "2026-08-21T00:00:00Z",
      }],
      throughSequence: 2,
      chapter: {
        blueprintId: "host-chapter-002",
        title: "档案馆",
        chapterIndex: 2,
        chapterFunction: "让顾岚进入档案馆核对变化地图。",
        entryState: "顾岚在档案馆外。",
        exitState: "顾岚抵达档案馆内部。",
        requiredChanges: ["顾岚进入档案馆"],
        forbiddenChanges: ["不揭示幕后改写者"],
        reveals: ["档案馆保存另一份地图"],
        withheldInformation: ["幕后改写者身份"],
        relationshipPressure: [],
        trackerMoves: ["七码头线索强化"],
        segments: [{
          segmentId: "segment-01",
          title: "进入档案馆",
          goal: "取得另一份地图。",
          entryState: "顾岚在档案馆外。",
          exitState: "顾岚进入档案馆。",
          requiredChanges: ["location 变为 archive"],
          forbiddenChanges: ["不解释异常机制"],
          worldDeltaRefs: ["character-gulan:location"],
          sceneMode: "investigation",
          eventFunction: "rule_revelation",
          pov: "顾岚",
          narrator: "third_person_limited",
          participants: ["顾岚"],
          informationState: {
            readerKnows: ["地图会变化"],
            povKnows: ["地图会变化"],
            withheld: ["幕后改写者身份"],
          },
          intendedReaderEffects: ["curiosity"],
          representationNeeds: ["spatial_evidence"],
          targetChars: 100,
          minChars: 80,
        }],
      },
    },
  })
  const branchPayload = objectValue(branch.payload)
  const blueprintProposalId = requiredString(branchPayload.blueprint_proposal_id, "blueprint_proposal_id")
  await run("narrative_memory", {
    action: "narrative_memory_submit_review",
    payload: { proposal_id: blueprintProposalId },
  })
  await run("narrative_plan", {
    action: "narrative_blueprint_confirm",
    payload: { proposal_id: blueprintProposalId },
  })

  process.stdout.write(`${JSON.stringify({
    transport: "ready",
    workflow: "host-orchestration-golden-v1",
    workspace: "temporary-cleaned-after-run",
    baselineHash,
    branchProvenanceProposalId: branchPayload.branch_provenance_proposal_id,
    blueprintProposalId,
    promotionBoundary: branchPayload.promotion_boundary,
    approvalEvents: sessionEvents.filter((event) => event.type.startsWith("approval/")).length,
    novelEvents: sessionEvents.filter((event) => event.type.startsWith("novel/")).length,
  })}\n`)
} finally {
  for (const fiber of fibers.reverse()) await fiber.dispose().catch(() => {})
  await rm(workspace, { recursive: true, force: true })
}

async function run(tool, argumentsValue) {
  const result = await ctx.tools.execute({
    signal: new AbortController().signal,
    callId: CallId(`host-golden-${++callIndex}`),
    name: tool,
    arguments: argumentsValue,
    agent,
  })
  if (result.isError) {
    const diagnostic = result.content.map((item) => item.type === "text" ? item.text : item.type).join("\n")
    throw new Error(`${argumentsValue.action} failed: ${diagnostic}`)
  }
  if (result.value === null || typeof result.value !== "object" || Array.isArray(result.value)) {
    throw new Error(`${argumentsValue.action} returned an invalid value`)
  }
  return result.value
}

async function markWorkspace() {
  const target = join(workspace, NOVELCODE_DSH_WORKSPACE_MARKER)
  await mkdir(join(target, ".."), { recursive: true })
  await writeFile(target, `${JSON.stringify({
    schema: NOVELCODE_DSH_WORKSPACE_SCHEMA,
    product: "novelcode-dsh",
    scope: "single-novel",
  })}\n`, "utf8")
}

function objectValue(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("expected object value")
  return value
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`)
  return value
}
