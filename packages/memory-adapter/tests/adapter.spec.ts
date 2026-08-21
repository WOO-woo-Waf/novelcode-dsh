import { describe, expect, it } from "vitest"
import type { KnowledgeClaim, StoryEvent } from "@novelcode-dsh/memory-model"
import type { BranchProposalSeed } from "@novelcode-dsh/simulation"
import {
  proposalForKnowledgeClaim,
  proposalForSelectedBranch,
  proposalForStoryEvent,
} from "../src/index.js"

const evidence = [{ sourceId: "chapter-1", revisionHash: "hash-1", locator: "scene-1" }]

describe("Memory OS to Narrative V2 proposal adapter", () => {
  it("maps a dual-time event to an L1 canon_event candidate", () => {
    const event: StoryEvent = {
      id: "event-map-change",
      eventType: "evidence_changed",
      lifecycle: "candidate",
      storyTime: { sequence: 4, label: "夜班" },
      narrativePosition: { chapterIndex: 1, sceneId: "archive", order: 2 },
      validity: { fromSequence: 4 },
      participants: ["character-a"],
      causes: ["event-map-found"],
      effects: [{ entityId: "map-a", fieldPath: "coastline", operation: "set", next: "seven-dock" }],
      evidence,
      recordedAt: "2026-08-21T00:00:00Z",
    }
    const input = proposalForStoryEvent(event)

    expect(input).toMatchObject({
      action: "narrative_memory_propose",
      payload: {
        id: "event-map-change",
        type: "canon_event",
        layer: "L1",
        data: { memory_os_schema: "story-event/v1" },
      },
    })
    expect(JSON.stringify(input)).not.toContain("author_confirmed")
  })

  it("preserves character-specific stance and visibility as a candidate", () => {
    const claim: KnowledgeClaim = {
      id: "knowledge-map-change",
      claimId: "map-changes-by-holder",
      subjectId: "character-a",
      stance: "suspects",
      confidence: 0.65,
      lifecycle: "candidate",
      acquiredAt: { sequence: 4 },
      validUntilSequence: 8,
      evidence,
      visibilityScope: ["character-a"],
    }
    const input = proposalForKnowledgeClaim(claim)

    expect(input.payload.data).toMatchObject({
      memory_os_schema: "knowledge-claim/v1",
      subject_id: "character-a",
      stance: "suspects",
      visibility_scope: ["character-a"],
    })
    expect(input.payload.evidence).toEqual(["chapter-1@hash-1#scene-1"])
  })

  it("keeps a selected branch behind the proposal-only promotion boundary", () => {
    const seed: BranchProposalSeed = {
      schema: "novelcode-branch-proposal-v1",
      sourceBranchId: "branch-a",
      baselineCanonHash: "canon-hash",
      hypothesis: "进入档案馆核对地图。",
      candidateEventIds: ["candidate-1"],
      worldDelta: [],
      costs: [],
      foreshadowImpacts: [],
    }
    const input = proposalForSelectedBranch(seed)

    expect(input.payload.data).toMatchObject({
      promotion_boundary: "proposal_only",
      baseline_canon_hash: "canon-hash",
    })
    expect(input.payload.tags).toContain("requires-blueprint-review")
    expect(input.payload).not.toHaveProperty("confirmation")
    expect(input.payload.data).not.toHaveProperty("confirmation")
  })

  it("can link branch provenance to a planned Blueprint without embedding it in Blueprint data", () => {
    const seed: BranchProposalSeed = {
      schema: "novelcode-branch-proposal-v1",
      sourceBranchId: "branch-linked",
      baselineCanonHash: "canon-hash",
      hypothesis: "验证地图。",
      candidateEventIds: ["candidate-1"],
      worldDelta: [],
      costs: [],
      foreshadowImpacts: [],
    }

    const input = proposalForSelectedBranch(seed, { plannedBlueprintId: "chapter-002" })
    expect(input.payload.data).toMatchObject({ planned_blueprint_id: "chapter-002" })
    expect(input.payload).not.toHaveProperty("confirmation")
  })
})
