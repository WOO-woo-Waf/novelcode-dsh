import type { ChapterBlueprintDraft } from "@novelcode-dsh/blueprint-compiler"
import type {
  ForeshadowDebtCandidateDraft,
  KnowledgeClaimCandidateDraft,
  LocatedCandidate,
  StoryEventCandidateDraft,
} from "@novelcode-dsh/state-recorder"
import type { BranchConstraint } from "@novelcode-dsh/simulation"
import type { BranchHypothesis, KnowledgeClaim, StoryEvent } from "@novelcode-dsh/memory-model"

export const BRANCH_BLUEPRINT_ORCHESTRATION_SCHEMA = "novelcode-branch-blueprint-orchestration-v1" as const
export const STATE_CANDIDATES_ORCHESTRATION_SCHEMA = "novelcode-approved-revision-state-orchestration-v1" as const

export interface BranchBlueprintOrchestrationEnvelope {
  schema: typeof BRANCH_BLUEPRINT_ORCHESTRATION_SCHEMA
  branch: BranchHypothesis
  candidateEvents: StoryEvent[]
  candidateKnowledge?: KnowledgeClaim[]
  constraints?: BranchConstraint[]
  throughSequence: number
  chapter: ChapterBlueprintDraft
}

export interface ApprovedRevisionStateOrchestrationEnvelope {
  schema: typeof STATE_CANDIDATES_ORCHESTRATION_SCHEMA
  manifestPath: string
  approvedRevisionPath: string
  approvedContentSha256: string
  throughStorySequence: number
  storyEvents?: Array<LocatedCandidate<StoryEventCandidateDraft>>
  knowledgeClaims?: Array<LocatedCandidate<KnowledgeClaimCandidateDraft>>
  foreshadowDebts?: Array<LocatedCandidate<ForeshadowDebtCandidateDraft>>
}
