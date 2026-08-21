import type { NarrativeToolInput } from "@novelcode-dsh/contracts"
import type {
  EpisodeSummary,
  ForeshadowDebt,
  KnowledgeClaim,
  StoryEvent,
} from "@novelcode-dsh/memory-model"
import type { BranchProposalSeed } from "@novelcode-dsh/simulation"

export type NarrativeMemoryProposalInput = NarrativeToolInput & {
  action: "narrative_memory_propose"
  payload: {
    id: string
    title: string
    type: "canon_event" | "narrative_memory" | "foreshadowing"
    layer: "L1" | "L3_MEMORY"
    body: string
    data: Record<string, unknown>
    evidence: string[]
    tags: string[]
  }
}

export function proposalForStoryEvent(event: StoryEvent): NarrativeMemoryProposalInput {
  const data = {
    memory_os_schema: "story-event/v1",
    source_lifecycle: event.lifecycle,
    event_type: event.eventType,
    story_time: event.storyTime,
    narrative_position: event.narrativePosition,
    validity: event.validity,
    participants: event.participants,
    causes: event.causes,
    effects: event.effects,
    evidence_refs: event.evidence,
    recorded_at: event.recordedAt,
  }
  return proposal({
    id: event.id,
    title: `Story Event · ${event.eventType} · ${event.id}`,
    type: "canon_event",
    layer: "L1",
    data,
    evidence: evidenceStrings(event.evidence),
    tags: ["memory-os", "story-event", "dual-time"],
  })
}

export function proposalForKnowledgeClaim(claim: KnowledgeClaim): NarrativeMemoryProposalInput {
  const data = {
    memory_os_schema: "knowledge-claim/v1",
    source_lifecycle: claim.lifecycle,
    claim_id: claim.claimId,
    subject_id: claim.subjectId,
    stance: claim.stance,
    confidence: claim.confidence,
    acquired_at: claim.acquiredAt,
    valid_until_sequence: claim.validUntilSequence,
    visibility_scope: claim.visibilityScope,
    evidence_refs: claim.evidence,
  }
  return proposal({
    id: claim.id,
    title: `Knowledge Claim · ${claim.subjectId} · ${claim.claimId}`,
    type: "narrative_memory",
    layer: "L3_MEMORY",
    data,
    evidence: evidenceStrings(claim.evidence),
    tags: ["memory-os", "knowledge-claim", `stance:${claim.stance}`],
  })
}

export function proposalForForeshadowDebt(debt: ForeshadowDebt): NarrativeMemoryProposalInput {
  const data = {
    memory_os_schema: "foreshadow-debt/v1",
    source_lifecycle: debt.lifecycle,
    status: debt.status,
    planted_at: debt.plantedAt,
    target_window: debt.targetWindow,
    related_entities: debt.relatedEntities,
    intended_reader_effects: debt.intendedReaderEffects,
    evidence_refs: debt.evidence,
  }
  return proposal({
    id: debt.id,
    title: `Foreshadow Debt · ${debt.id}`,
    type: "foreshadowing",
    layer: "L1",
    data,
    evidence: evidenceStrings(debt.evidence),
    tags: ["memory-os", "foreshadow", `status:${debt.status}`],
  })
}

export function proposalForEpisodeSummary(summary: EpisodeSummary): NarrativeMemoryProposalInput {
  const data = {
    memory_os_schema: "episode-summary/v1",
    source_lifecycle: summary.lifecycle,
    level: summary.level,
    member_ids: summary.memberIds,
    source_hashes: summary.sourceHashes,
    coverage: summary.coverage,
    conflicts: summary.conflicts,
    unassigned_items: summary.unassignedItems,
  }
  return proposal({
    id: summary.id,
    title: `Episode Summary · ${summary.level} · ${summary.id}`,
    type: "narrative_memory",
    layer: "L3_MEMORY",
    data,
    evidence: summary.sourceHashes.map((hash) => `member-hash:${hash}`).sort(),
    tags: ["memory-os", "episode-summary", `level:${summary.level}`],
  })
}

export function proposalForSelectedBranch(
  seed: BranchProposalSeed,
  linkage: { plannedBlueprintId?: string } = {},
): NarrativeMemoryProposalInput {
  const data = {
    memory_os_schema: seed.schema,
    source_branch_id: seed.sourceBranchId,
    baseline_canon_hash: seed.baselineCanonHash,
    hypothesis: seed.hypothesis,
    candidate_event_ids: seed.candidateEventIds,
    world_delta: seed.worldDelta,
    costs: seed.costs,
    foreshadow_impacts: seed.foreshadowImpacts,
    planned_blueprint_id: linkage.plannedBlueprintId,
    promotion_boundary: "proposal_only",
  }
  return proposal({
    id: `branch-proposal-${seed.sourceBranchId}`,
    title: `Selected Branch Proposal · ${seed.sourceBranchId}`,
    type: "narrative_memory",
    layer: "L3_MEMORY",
    data,
    evidence: [`canon:${seed.baselineCanonHash}`],
    tags: ["memory-os", "branch-proposal", "requires-blueprint-review"],
  })
}

function proposal(input: {
  id: string
  title: string
  type: NarrativeMemoryProposalInput["payload"]["type"]
  layer: NarrativeMemoryProposalInput["payload"]["layer"]
  data: Record<string, unknown>
  evidence: string[]
  tags: string[]
}): NarrativeMemoryProposalInput {
  if (input.id.trim().length === 0) throw new Error("proposal id must not be empty")
  return {
    action: "narrative_memory_propose",
    payload: {
      id: input.id,
      title: input.title,
      type: input.type,
      layer: input.layer,
      body: markdownBody(input.title, input.data),
      data: structuredClone(input.data),
      evidence: [...new Set(input.evidence)].sort(),
      tags: [...new Set(input.tags)].sort(),
    },
  }
}

function evidenceStrings(evidence: readonly { sourceId: string; revisionHash: string; locator: string }[]): string[] {
  return evidence.map((item) => `${item.sourceId}@${item.revisionHash}#${item.locator}`).sort()
}

function markdownBody(title: string, data: Record<string, unknown>): string {
  const json = JSON.stringify(sortValue(data), null, 2)
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n")
  return `# ${title}\n\nStructured Memory OS candidate. This page remains a proposal until the existing Narrative V2 review and author-confirmation lifecycle completes.\n\n${json}`
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value === null || typeof value !== "object") return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, sortValue(child)]))
}
