import type { JsonValue } from "@novelcode-dsh/contracts"

export type MemoryLifecycle =
  | "observation"
  | "candidate"
  | "pending_review"
  | "confirmed"
  | "superseded"
  | "archived"

export interface NarrativeLocator {
  arcId?: string
  chapterIndex: number
  sceneId?: string
  segmentId?: string
  order: number
}

export interface StoryTime {
  sequence: number
  calendar?: string
  label?: string
}

export interface ValidityWindow {
  fromSequence: number
  toSequence?: number
}

export interface EvidenceRef {
  sourceId: string
  revisionHash: string
  locator: string
}

export interface EntityStateTransition {
  entityId: string
  fieldPath: string
  operation: "set" | "unset"
  previous?: JsonValue
  next?: JsonValue
}

export interface StoryEvent {
  id: string
  eventType: string
  lifecycle: MemoryLifecycle
  storyTime: StoryTime
  narrativePosition: NarrativeLocator
  validity: ValidityWindow
  participants: string[]
  causes: string[]
  effects: EntityStateTransition[]
  evidence: EvidenceRef[]
  recordedAt: string
}

export type KnowledgeStance =
  | "knows"
  | "believes"
  | "suspects"
  | "disbelieves"
  | "unknown"

export interface KnowledgeClaim {
  id: string
  claimId: string
  subjectId: string
  stance: KnowledgeStance
  confidence: number
  lifecycle: MemoryLifecycle
  acquiredAt: StoryTime
  validUntilSequence?: number
  evidence: EvidenceRef[]
  visibilityScope: string[]
}

export type ForeshadowStatus =
  | "planted"
  | "reinforced"
  | "misdirected"
  | "partial_payoff"
  | "resolved"
  | "abandoned"

export interface ForeshadowDebt {
  id: string
  lifecycle: MemoryLifecycle
  status: ForeshadowStatus
  plantedAt: NarrativeLocator
  targetWindow?: { earliestChapter: number; latestChapter: number }
  relatedEntities: string[]
  intendedReaderEffects: string[]
  evidence: EvidenceRef[]
}

export interface EpisodeSummary {
  id: string
  level: "segment" | "scene" | "chapter" | "arc"
  lifecycle: MemoryLifecycle
  memberIds: string[]
  sourceHashes: string[]
  coverage: number
  conflicts: string[]
  unassignedItems: string[]
}

export interface BranchHypothesis {
  id: string
  baselineCanonHash: string
  status: "sandbox" | "selected" | "rejected" | "expired"
  hypothesis: string
  candidateEventIds: string[]
  stateDelta: EntityStateTransition[]
  costs: string[]
  conflicts: string[]
  foreshadowImpacts: string[]
}

export interface RevisionPreference {
  id: string
  lifecycle: MemoryLifecycle
  draftLocator: string
  authorRevisionLocator: string
  changeType: string
  rationale?: string
  conditions: Record<string, JsonValue>
  intendedEffects: string[]
  evidence: EvidenceRef[]
  counterevidence: EvidenceRef[]
  repeatedEvidenceCount: number
}

export interface ProjectionConflict {
  eventId: string
  entityId: string
  fieldPath: string
  expected?: JsonValue
  actual?: JsonValue
  reason: "previous_mismatch" | "missing_next_value"
}

export interface StateProjection {
  throughSequence: number
  values: Record<string, JsonValue>
  appliedEventIds: string[]
  conflicts: ProjectionConflict[]
}

export interface ConsolidationAudit {
  duplicateMemberIds: string[]
  unknownMemberIds: string[]
  omittedMemberIds: string[]
  valid: boolean
}
