import { describe, expect, it } from "vitest"
import {
  auditConsolidation,
  projectConfirmedState,
  revisionPreferenceExecutable,
  stateKey,
  visibleKnowledgeAt,
  type EpisodeSummary,
  type KnowledgeClaim,
  type StoryEvent,
} from "../src/index.js"

const locator = { chapterIndex: 1, order: 1 }
const evidence = [{ sourceId: "chapter-1", revisionHash: "hash-1", locator: "scene-1" }]

describe("temporal world-state projection", () => {
  it("replays only confirmed events through the requested story time", () => {
    const events: StoryEvent[] = [
      event("e1", 1, [{ entityId: "role-a", fieldPath: "location", operation: "set", next: "gate" }]),
      event("e2", 2, [{ entityId: "role-a", fieldPath: "location", operation: "set", previous: "gate", next: "tower" }]),
      { ...event("e3", 3, [{ entityId: "role-a", fieldPath: "location", operation: "set", next: "river" }]), lifecycle: "candidate" },
    ]

    expect(projectConfirmedState(events, 1).values[stateKey("role-a", "location")]).toBe("gate")
    const throughTwo = projectConfirmedState(events, 2)
    expect(throughTwo.values[stateKey("role-a", "location")]).toBe("tower")
    expect(throughTwo.appliedEventIds).toEqual(["e1", "e2"])
  })

  it("reports a conflicting previous value instead of silently rewriting state", () => {
    const projection = projectConfirmedState([
      event("e1", 1, [{ entityId: "item-key", fieldPath: "owner", operation: "set", next: "role-a" }]),
      event("e2", 2, [{ entityId: "item-key", fieldPath: "owner", operation: "set", previous: "role-b", next: "role-c" }]),
    ], 2)

    expect(projection.values[stateKey("item-key", "owner")]).toBe("role-a")
    expect(projection.conflicts).toMatchObject([{
      eventId: "e2",
      expected: "role-b",
      actual: "role-a",
      reason: "previous_mismatch",
    }])
  })
})

describe("character knowledge", () => {
  it("returns the latest confirmed stance visible at a story time", () => {
    const claims: KnowledgeClaim[] = [
      claim("k1", 2, "suspects", "confirmed"),
      claim("k2", 5, "knows", "confirmed"),
      claim("k3", 6, "disbelieves", "candidate"),
    ]
    expect(visibleKnowledgeAt(claims, "role-a", 4).map((item) => item.stance)).toEqual(["suspects"])
    expect(visibleKnowledgeAt(claims, "role-a", 6).map((item) => item.stance)).toEqual(["knows"])
  })
})

describe("memory consolidation and revision learning", () => {
  it("keeps complete member lineage", () => {
    const summary: EpisodeSummary = {
      id: "chapter-1-summary",
      level: "chapter",
      lifecycle: "candidate",
      memberIds: ["scene-1", "scene-2"],
      sourceHashes: ["hash-1", "hash-2"],
      coverage: 1,
      conflicts: [],
      unassignedItems: [],
    }
    expect(auditConsolidation(summary, ["scene-1", "scene-2"]).valid).toBe(true)
    expect(auditConsolidation(summary, ["scene-1", "scene-2", "scene-3"]).omittedMemberIds).toEqual(["scene-3"])
  })

  it("does not execute a one-off or unconfirmed author edit as a permanent style rule", () => {
    expect(revisionPreferenceExecutable({
      lifecycle: "observation",
      repeatedEvidenceCount: 1,
      evidence: [evidence[0]],
      conditions: { scene_mode: "dialogue" },
    })).toBe(false)
    expect(revisionPreferenceExecutable({
      lifecycle: "confirmed",
      repeatedEvidenceCount: 2,
      evidence: [evidence[0], { ...evidence[0], locator: "scene-2" }],
      conditions: { scene_mode: "dialogue" },
    })).toBe(true)
  })
})

function event(
  id: string,
  sequence: number,
  effects: StoryEvent["effects"],
): StoryEvent {
  return {
    id,
    eventType: "state_change",
    lifecycle: "confirmed",
    storyTime: { sequence },
    narrativePosition: { ...locator, order: sequence },
    validity: { fromSequence: 0 },
    participants: [],
    causes: [],
    effects,
    evidence,
    recordedAt: "2026-08-21T00:00:00Z",
  }
}

function claim(
  id: string,
  sequence: number,
  stance: KnowledgeClaim["stance"],
  lifecycle: KnowledgeClaim["lifecycle"],
): KnowledgeClaim {
  return {
    id,
    claimId: "secret-1",
    subjectId: "role-a",
    stance,
    confidence: 0.8,
    lifecycle,
    acquiredAt: { sequence },
    evidence,
    visibilityScope: ["role-a"],
  }
}
