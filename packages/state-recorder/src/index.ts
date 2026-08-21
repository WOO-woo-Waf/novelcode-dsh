import { createHash } from "node:crypto"
import { readFile, realpath } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
import {
  proposalForForeshadowDebt,
  proposalForKnowledgeClaim,
  proposalForStoryEvent,
  type NarrativeMemoryProposalInput,
} from "@novelcode-dsh/memory-adapter"
import type {
  EvidenceRef,
  ForeshadowDebt,
  KnowledgeClaim,
  StoryEvent,
} from "@novelcode-dsh/memory-model"

export interface RevisionTextLocator {
  chapterIndex: number
  segmentId?: string
  startLine: number
  endLine: number
  excerptSha256: string
}

export interface LocatedCandidate<T> {
  candidate: T
  locator: RevisionTextLocator
}

export type StoryEventCandidateDraft = Omit<StoryEvent, "lifecycle" | "evidence"> & {
  lifecycle?: "candidate"
}

export type KnowledgeClaimCandidateDraft = Omit<KnowledgeClaim, "lifecycle" | "evidence"> & {
  lifecycle?: "candidate"
  sourceEventId: string
}

export type ForeshadowDebtCandidateDraft = Omit<ForeshadowDebt, "lifecycle" | "evidence"> & {
  lifecycle?: "candidate"
}

export interface ApprovedRevisionStateInput {
  workspaceRoot: string
  manifestPath: string
  approvedRevisionPath: string
  approvedContentSha256: string
  throughStorySequence: number
  storyEvents?: Array<LocatedCandidate<StoryEventCandidateDraft>>
  knowledgeClaims?: Array<LocatedCandidate<KnowledgeClaimCandidateDraft>>
  foreshadowDebts?: Array<LocatedCandidate<ForeshadowDebtCandidateDraft>>
}

export interface ApprovedRevisionStateCompilation {
  schema: "novelcode-approved-revision-state-candidates-v1"
  revisionId: string
  revisionPath: string
  revisionHash: string
  chapterIndex: number
  proposals: NarrativeMemoryProposalInput[]
}

interface ApprovedWritingManifest {
  schema: "novelcode-writing-run-v2"
  status: "approved"
  chapter_index: number
  approved_export_path: string
  approved_revision_id: string
  approved_content_sha256: string
  segments: Array<{ segment_id: string }>
}

export async function compileApprovedRevisionStateCandidates(
  input: ApprovedRevisionStateInput,
): Promise<ApprovedRevisionStateCompilation> {
  assertNonNegativeInteger(input.throughStorySequence, "throughStorySequence")
  const workspaceRoot = await realpath(input.workspaceRoot)
  const manifestFile = await resolveExistingWorkspacePath(workspaceRoot, input.manifestPath)
  const manifest = parseManifest(JSON.parse(await readFile(manifestFile, "utf8")))
  const requestedRevision = await resolveExistingWorkspacePath(workspaceRoot, input.approvedRevisionPath)
  const manifestRevision = await resolveExistingWorkspacePath(workspaceRoot, manifest.approved_export_path)
  if (requestedRevision !== manifestRevision) throw new Error("approved revision path does not match the manifest")
  if (input.approvedContentSha256 !== manifest.approved_content_sha256) {
    throw new Error("approved revision hash does not match the manifest")
  }
  const text = await readFile(requestedRevision, "utf8")
  const actualHash = sha256(text)
  if (actualHash !== manifest.approved_content_sha256) throw new Error("approved revision content hash mismatch")

  const events = input.storyEvents ?? []
  const claims = input.knowledgeClaims ?? []
  const debts = input.foreshadowDebts ?? []
  if (events.length + claims.length + debts.length === 0) {
    throw new Error("at least one evidence-bound state candidate is required")
  }
  assertUniqueCandidateIds([
    ...events.map((item) => item.candidate.id),
    ...claims.map((item) => item.candidate.id),
    ...debts.map((item) => item.candidate.id),
  ])
  const segmentIds = new Set(manifest.segments.map((segment) => segment.segment_id))
  const eventTimes = new Map<string, number>()
  const proposals: NarrativeMemoryProposalInput[] = []

  for (const item of events) {
    assertCandidateLifecycle(item.candidate.lifecycle, `StoryEvent ${item.candidate.id}`)
    const evidence = evidenceFor(item.locator, text, manifest, segmentIds)
    validateNarrativePosition(item.candidate, item.locator, manifest.chapter_index)
    if (item.candidate.storyTime.sequence > input.throughStorySequence) {
      throw new Error(`StoryEvent ${item.candidate.id} occurs after the approved chapter state boundary`)
    }
    eventTimes.set(item.candidate.id, item.candidate.storyTime.sequence)
    proposals.push(proposalForStoryEvent({
      ...item.candidate,
      lifecycle: "candidate",
      evidence: [evidence],
    }))
  }

  for (const item of claims) {
    assertCandidateLifecycle(item.candidate.lifecycle, `KnowledgeClaim ${item.candidate.id}`)
    const sourceTime = eventTimes.get(item.candidate.sourceEventId)
    if (sourceTime === undefined) {
      throw new Error(`KnowledgeClaim ${item.candidate.id} requires an in-chapter source StoryEvent`)
    }
    if (item.candidate.acquiredAt.sequence < sourceTime
      || item.candidate.acquiredAt.sequence > input.throughStorySequence) {
      throw new Error(`KnowledgeClaim ${item.candidate.id} has an invalid acquisition time`)
    }
    if (!item.candidate.visibilityScope.includes(item.candidate.subjectId)) {
      throw new Error(`KnowledgeClaim ${item.candidate.id} visibility must include its subject`)
    }
    const evidence = evidenceFor(item.locator, text, manifest, segmentIds)
    const { sourceEventId: _sourceEventId, ...candidate } = item.candidate
    proposals.push(proposalForKnowledgeClaim({
      ...candidate,
      lifecycle: "candidate",
      evidence: [evidence],
    }))
  }

  for (const item of debts) {
    assertCandidateLifecycle(item.candidate.lifecycle, `ForeshadowDebt ${item.candidate.id}`)
    const evidence = evidenceFor(item.locator, text, manifest, segmentIds)
    proposals.push(proposalForForeshadowDebt({
      ...item.candidate,
      lifecycle: "candidate",
      evidence: [evidence],
    }))
  }

  return {
    schema: "novelcode-approved-revision-state-candidates-v1",
    revisionId: manifest.approved_revision_id,
    revisionPath: workspaceRelative(workspaceRoot, requestedRevision),
    revisionHash: actualHash,
    chapterIndex: manifest.chapter_index,
    proposals,
  }
}

export function revisionExcerptSha256(text: string, startLine: number, endLine: number): string {
  const lines = text.split(/\r?\n/u)
  assertPositiveInteger(startLine, "startLine")
  assertPositiveInteger(endLine, "endLine")
  if (endLine < startLine || endLine > lines.length) throw new Error("revision locator line range is out of bounds")
  const excerpt = lines.slice(startLine - 1, endLine).join("\n")
  if (excerpt.trim().length === 0) throw new Error("revision locator cannot point only to blank text")
  return sha256(excerpt)
}

function evidenceFor(
  locator: RevisionTextLocator,
  text: string,
  manifest: ApprovedWritingManifest,
  segmentIds: ReadonlySet<string>,
): EvidenceRef {
  if (locator.chapterIndex !== manifest.chapter_index) throw new Error("revision locator chapter does not match manifest")
  if (locator.segmentId !== undefined && !segmentIds.has(locator.segmentId)) {
    throw new Error(`revision locator references unknown segment ${locator.segmentId}`)
  }
  const excerptHash = revisionExcerptSha256(text, locator.startLine, locator.endLine)
  if (excerptHash !== locator.excerptSha256) throw new Error("revision locator excerpt hash mismatch")
  const chapter = String(locator.chapterIndex).padStart(3, "0")
  const scope = locator.segmentId === undefined ? "chapter" : `segment:${locator.segmentId}`
  return {
    sourceId: manifest.approved_revision_id,
    revisionHash: manifest.approved_content_sha256,
    locator: `chapter:${chapter}/${scope}/lines:${locator.startLine}-${locator.endLine}/excerpt-sha256:${excerptHash}`,
  }
}

function validateNarrativePosition(
  candidate: StoryEventCandidateDraft,
  locator: RevisionTextLocator,
  chapterIndex: number,
): void {
  if (candidate.narrativePosition.chapterIndex !== chapterIndex) {
    throw new Error(`StoryEvent ${candidate.id} narrative chapter does not match approved revision`)
  }
  if (locator.segmentId !== undefined
    && candidate.narrativePosition.segmentId !== undefined
    && locator.segmentId !== candidate.narrativePosition.segmentId) {
    throw new Error(`StoryEvent ${candidate.id} segment does not match its evidence locator`)
  }
}

function parseManifest(value: unknown): ApprovedWritingManifest {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("writing manifest must be an object")
  const record = value as Record<string, unknown>
  if (record.schema !== "novelcode-writing-run-v2") throw new Error("unsupported writing manifest schema")
  if (record.status !== "approved") throw new Error("chapter manifest is not author-approved")
  assertPositiveInteger(record.chapter_index, "manifest.chapter_index")
  const approvedExportPath = requiredString(record.approved_export_path, "manifest.approved_export_path")
  const approvedRevisionId = requiredString(record.approved_revision_id, "manifest.approved_revision_id")
  const approvedHash = requiredHash(record.approved_content_sha256, "manifest.approved_content_sha256")
  if (!Array.isArray(record.segments) || record.segments.length === 0) throw new Error("manifest requires segments")
  const segments = record.segments.map((value, index) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`manifest.segments[${index}] must be an object`)
    }
    return { segment_id: requiredString((value as Record<string, unknown>).segment_id, `manifest.segments[${index}].segment_id`) }
  })
  assertUniqueCandidateIds(segments.map((segment) => segment.segment_id))
  return {
    schema: "novelcode-writing-run-v2",
    status: "approved",
    chapter_index: record.chapter_index,
    approved_export_path: approvedExportPath,
    approved_revision_id: approvedRevisionId,
    approved_content_sha256: approvedHash,
    segments,
  }
}

async function resolveExistingWorkspacePath(workspaceRoot: string, selectedPath: string): Promise<string> {
  const candidate = isAbsolute(selectedPath) ? resolve(selectedPath) : resolve(workspaceRoot, selectedPath)
  const lexical = relative(workspaceRoot, candidate)
  if (lexical === ".." || lexical.startsWith(`..${sep}`) || isAbsolute(lexical)) {
    throw new Error("path escapes the novel workspace")
  }
  const canonical = await realpath(candidate)
  const canonicalRelative = relative(workspaceRoot, canonical)
  if (canonicalRelative === ".." || canonicalRelative.startsWith(`..${sep}`) || isAbsolute(canonicalRelative)) {
    throw new Error("resolved path escapes the novel workspace")
  }
  return canonical
}

function workspaceRelative(workspaceRoot: string, selectedPath: string): string {
  return relative(workspaceRoot, selectedPath).split(sep).join("/")
}

function assertCandidateLifecycle(lifecycle: "candidate" | undefined, label: string): void {
  if (lifecycle !== undefined && lifecycle !== "candidate") throw new Error(`${label} must remain candidate`)
}

function assertUniqueCandidateIds(ids: readonly string[]): void {
  for (const id of ids) requiredString(id, "candidate id")
  if (new Set(ids).size !== ids.length) throw new Error("candidate IDs must be unique")
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`)
  return value
}

function requiredHash(value: unknown, label: string): string {
  const hash = requiredString(value, label)
  if (!/^[a-f0-9]{64}$/u.test(hash)) throw new Error(`${label} must be a lowercase SHA-256 hash`)
  return hash
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
}

function assertNonNegativeInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}
