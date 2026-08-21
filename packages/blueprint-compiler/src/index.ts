import type { NarrativeToolInput } from "@novelcode-dsh/contracts"
import { proposalForSelectedBranch, type NarrativeMemoryProposalInput } from "@novelcode-dsh/memory-adapter"
import type { EntityStateTransition } from "@novelcode-dsh/memory-model"
import type { BranchProposalSeed, BranchSimulationResult } from "@novelcode-dsh/simulation"

export interface BlueprintInformationState {
  readerKnows: string[]
  povKnows: string[]
  withheld: string[]
}

export interface BlueprintSegmentDraft {
  segmentId: string
  arcId?: string
  sceneId?: string
  title: string
  goal: string
  entryState: string
  exitState: string
  requiredChanges: string[]
  forbiddenChanges: string[]
  worldDeltaRefs: string[]
  sceneMode?: string
  eventFunction?: string
  pov: string
  narrator?: string
  participants: string[]
  relationshipPattern?: string
  informationState: BlueprintInformationState
  pressureCurve?: string
  intendedReaderEffects: string[]
  representationNeeds: string[]
  targetChars: number
  minChars: number
}

export interface ChapterBlueprintDraft {
  blueprintId: string
  arcId?: string
  title: string
  chapterIndex: number
  chapterFunction: string
  entryState: string
  exitState: string
  requiredChanges: string[]
  forbiddenChanges: string[]
  reveals: string[]
  withheldInformation: string[]
  relationshipPressure: string[]
  trackerMoves: string[]
  targetChars?: number
  minChars?: number
  segments: BlueprintSegmentDraft[]
}

export type NarrativeBlueprintProposalInput = NarrativeToolInput & {
  action: "narrative_blueprint_propose"
  payload: Record<string, unknown>
}

export interface BranchBlueprintCompilationInput {
  seed: BranchProposalSeed
  simulation: BranchSimulationResult
  currentBaselineCanonHash: string
  chapter: ChapterBlueprintDraft
}

export interface BranchBlueprintCompilation {
  schema: "novelcode-branch-blueprint-compilation-v1"
  sourceBranchId: string
  baselineCanonHash: string
  blueprintId: string
  provenanceProposal: NarrativeMemoryProposalInput
  blueprintProposal: NarrativeBlueprintProposalInput
}

export function compileBranchBlueprint(input: BranchBlueprintCompilationInput): BranchBlueprintCompilation {
  validateBranch(input)
  validateChapter(input.chapter, input.seed.worldDelta)
  const targetChars = input.chapter.targetChars
    ?? input.chapter.segments.reduce((total, segment) => total + segment.targetChars, 0)
  const minChars = input.chapter.minChars
    ?? input.chapter.segments.reduce((total, segment) => total + segment.minChars, 0)
  assertPositiveInteger(targetChars, "chapter.targetChars")
  assertPositiveInteger(minChars, "chapter.minChars")
  if (minChars > targetChars) throw new Error("chapter minChars cannot exceed targetChars")

  return {
    schema: "novelcode-branch-blueprint-compilation-v1",
    sourceBranchId: input.seed.sourceBranchId,
    baselineCanonHash: input.seed.baselineCanonHash,
    blueprintId: input.chapter.blueprintId,
    provenanceProposal: proposalForSelectedBranch(input.seed, { plannedBlueprintId: input.chapter.blueprintId }),
    blueprintProposal: {
      action: "narrative_blueprint_propose",
      payload: {
        blueprint_id: input.chapter.blueprintId,
        ...(input.chapter.arcId === undefined ? {} : { arc_id: input.chapter.arcId }),
        title: input.chapter.title,
        chapter_index: input.chapter.chapterIndex,
        chapter_function: input.chapter.chapterFunction,
        entry_state: input.chapter.entryState,
        exit_state: input.chapter.exitState,
        required_changes: [...input.chapter.requiredChanges],
        forbidden_changes: [...input.chapter.forbiddenChanges],
        reveals: [...input.chapter.reveals],
        withheld_information: [...input.chapter.withheldInformation],
        relationship_pressure: [...input.chapter.relationshipPressure],
        tracker_moves: [...input.chapter.trackerMoves],
        target_chars: targetChars,
        min_chars: minChars,
        segments: input.chapter.segments.map((segment) => ({
          segment_id: segment.segmentId,
          ...(segment.arcId === undefined ? {} : { arc_id: segment.arcId }),
          ...(segment.sceneId === undefined ? {} : { scene_id: segment.sceneId }),
          title: segment.title,
          goal: segment.goal,
          entry_state: segment.entryState,
          exit_state: segment.exitState,
          required_changes: [...segment.requiredChanges],
          forbidden_changes: [...segment.forbiddenChanges],
          ...(segment.sceneMode === undefined ? {} : { scene_mode: segment.sceneMode }),
          ...(segment.eventFunction === undefined ? {} : { event_function: segment.eventFunction }),
          pov: segment.pov,
          ...(segment.narrator === undefined ? {} : { narrator: segment.narrator }),
          participants: [...segment.participants],
          ...(segment.relationshipPattern === undefined ? {} : { relationship_pattern: segment.relationshipPattern }),
          information_state: {
            reader_knows: [...segment.informationState.readerKnows],
            pov_knows: [...segment.informationState.povKnows],
            withheld: [...segment.informationState.withheld],
          },
          ...(segment.pressureCurve === undefined ? {} : { pressure_curve: segment.pressureCurve }),
          intended_reader_effects: [...segment.intendedReaderEffects],
          representation_needs: [...segment.representationNeeds],
          target_chars: segment.targetChars,
          min_chars: segment.minChars,
        })),
      },
    },
  }
}

export function worldDeltaRef(transition: Pick<EntityStateTransition, "entityId" | "fieldPath">): string {
  return `${transition.entityId}:${transition.fieldPath}`
}

function validateBranch(input: BranchBlueprintCompilationInput): void {
  if (input.seed.schema !== "novelcode-branch-proposal-v1") throw new Error("unsupported branch seed schema")
  if (!input.simulation.viable) throw new Error("a non-viable branch simulation cannot compile a Blueprint")
  if (input.seed.sourceBranchId !== input.simulation.branchId) throw new Error("branch seed and simulation identity differ")
  if (input.seed.baselineCanonHash !== input.simulation.baselineCanonHash) {
    throw new Error("branch seed and simulation baseline hashes differ")
  }
  if (input.currentBaselineCanonHash !== input.seed.baselineCanonHash) {
    throw new Error("a stale branch seed cannot compile a Blueprint")
  }
  if (stableJson(input.seed.worldDelta) !== stableJson(input.simulation.worldDelta)) {
    throw new Error("branch seed world delta differs from the viable simulation")
  }
  assertNonEmpty(input.seed.sourceBranchId, "seed.sourceBranchId")
  assertNonEmpty(input.seed.baselineCanonHash, "seed.baselineCanonHash")
  assertUniqueNonEmpty(input.seed.candidateEventIds, "seed.candidateEventIds")
}

function validateChapter(chapter: ChapterBlueprintDraft, worldDelta: readonly EntityStateTransition[]): void {
  assertNonEmpty(chapter.blueprintId, "chapter.blueprintId")
  assertNonEmpty(chapter.title, "chapter.title")
  assertNonEmpty(chapter.chapterFunction, "chapter.chapterFunction")
  assertNonEmpty(chapter.entryState, "chapter.entryState")
  assertNonEmpty(chapter.exitState, "chapter.exitState")
  assertPositiveInteger(chapter.chapterIndex, "chapter.chapterIndex")
  if (chapter.segments.length === 0) throw new Error("Blueprint requires at least one segment")
  assertUniqueNonEmpty(chapter.segments.map((segment) => segment.segmentId), "segment IDs")

  const expectedRefs = new Set(worldDelta.map(worldDeltaRef))
  const seenRefs = new Set<string>()
  for (const [index, segment] of chapter.segments.entries()) {
    const label = `chapter.segments[${index}]`
    assertNonEmpty(segment.title, `${label}.title`)
    assertNonEmpty(segment.goal, `${label}.goal`)
    assertNonEmpty(segment.entryState, `${label}.entryState`)
    assertNonEmpty(segment.exitState, `${label}.exitState`)
    assertNonEmpty(segment.pov, `${label}.pov`)
    assertPositiveInteger(segment.targetChars, `${label}.targetChars`)
    assertPositiveInteger(segment.minChars, `${label}.minChars`)
    if (segment.minChars > segment.targetChars) throw new Error(`${label}.minChars cannot exceed targetChars`)
    if (segment.worldDeltaRefs.length > 0 && segment.requiredChanges.length === 0) {
      throw new Error(`${label} maps world delta but has no requiredChanges`)
    }
    const information = segment.informationState
    if (information === undefined
      || information.readerKnows.length + information.povKnows.length + information.withheld.length === 0) {
      throw new Error(`${label} must declare a non-empty information boundary`)
    }
    assertUniqueNonEmpty(segment.worldDeltaRefs, `${label}.worldDeltaRefs`)
    for (const reference of segment.worldDeltaRefs) {
      if (!expectedRefs.has(reference)) throw new Error(`${label} references unknown world delta ${reference}`)
      if (seenRefs.has(reference)) throw new Error(`world delta ${reference} is mapped by more than one segment`)
      seenRefs.add(reference)
    }
  }
  const missing = [...expectedRefs].filter((reference) => !seenRefs.has(reference))
  if (missing.length > 0) throw new Error(`world delta is not covered by segment required changes: ${missing.join(", ")}`)
}

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`${label} must not be empty`)
}

function assertUniqueNonEmpty(values: readonly string[], label: string): void {
  for (const value of values) assertNonEmpty(value, label)
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique`)
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`)
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value === null || typeof value !== "object") return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, sortValue(child)]))
}
