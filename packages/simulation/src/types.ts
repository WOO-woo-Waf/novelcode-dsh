import type { JsonValue } from "@novelcode-dsh/contracts"
import type {
  BranchHypothesis,
  EntityStateTransition,
  KnowledgeClaim,
  KnowledgeStance,
  StateProjection,
  StoryEvent,
} from "@novelcode-dsh/memory-model"

export interface EventOrderConstraint {
  id: string
  kind: "event_order"
  beforeEventId: string
  afterEventId: string
}

export interface StatePreconditionConstraint {
  id: string
  kind: "state_precondition"
  eventId: string
  entityId: string
  fieldPath: string
  expected?: JsonValue
  mustExist?: boolean
}

export interface KnowledgeRequiredConstraint {
  id: string
  kind: "knowledge_required"
  eventId: string
  subjectId: string
  claimId: string
  allowedStances: KnowledgeStance[]
}

export type BranchConstraint =
  | EventOrderConstraint
  | StatePreconditionConstraint
  | KnowledgeRequiredConstraint

export type BranchViolationKind =
  | "stale_baseline"
  | "candidate_identity_mismatch"
  | "candidate_lifecycle"
  | "declared_conflict"
  | "missing_or_forward_cause"
  | "event_order"
  | "state_precondition"
  | "knowledge_leakage"
  | "state_delta_mismatch"
  | "projection_conflict"

export interface BranchViolation {
  kind: BranchViolationKind
  message: string
  hard: boolean
  eventId?: string
  constraintId?: string
}

export interface BranchSimulationInput {
  branch: BranchHypothesis
  baselineEvents: StoryEvent[]
  baselineKnowledge: KnowledgeClaim[]
  candidateEvents: StoryEvent[]
  candidateKnowledge?: KnowledgeClaim[]
  constraints?: BranchConstraint[]
  throughSequence: number
}

export interface BranchSimulationMetrics {
  hardViolations: number
  softViolations: number
  projectionConflicts: number
  costs: number
  foreshadowImpacts: number
  declaredConflicts: number
  score: number
}

export interface BranchSimulationResult {
  branchId: string
  baselineCanonHash: string
  viable: boolean
  baseline: StateProjection
  projected: StateProjection
  worldDelta: EntityStateTransition[]
  violations: BranchViolation[]
  metrics: BranchSimulationMetrics
}

export interface BranchProposalSeed {
  schema: "novelcode-branch-proposal-v1"
  sourceBranchId: string
  baselineCanonHash: string
  hypothesis: string
  candidateEventIds: string[]
  worldDelta: EntityStateTransition[]
  costs: string[]
  foreshadowImpacts: string[]
}
