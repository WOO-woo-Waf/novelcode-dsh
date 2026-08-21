import { describe, expect, it } from "vitest"
import {
  baselineCanonHash,
  createBranchProposalSeed,
  rankBranchCandidates,
  simulateBranch,
  type BranchSimulationInput,
} from "../src/index.js"
import type {
  BranchHypothesis,
  EntityStateTransition,
  KnowledgeClaim,
  StoryEvent,
} from "@novelcode-dsh/memory-model"

const evidence = [{ sourceId: "chapter-1", revisionHash: "revision-1", locator: "scene-1" }]

describe("branch sandbox simulation", () => {
  it("projects a viable candidate without promoting it to confirmed canon", () => {
    const input = scenario()
    const result = simulateBranch(input)

    expect(result.viable).toBe(true)
    expect(result.projected.values["character-a:location"]).toBe("archive")
    expect(input.candidateEvents[0]?.lifecycle).toBe("candidate")
    expect(result.worldDelta).toEqual([{
      entityId: "character-a",
      fieldPath: "location",
      operation: "set",
      previous: "station",
      next: "archive",
    }])
    expect(createBranchProposalSeed(input.branch, result)).toMatchObject({
      schema: "novelcode-branch-proposal-v1",
      sourceBranchId: "branch-a",
      candidateEventIds: ["candidate-1"],
    })
  })

  it("fails closed when confirmed canon changed after the branch was created", () => {
    const input = scenario()
    input.branch.baselineCanonHash = "stale-hash"
    const result = simulateBranch(input)

    expect(result.viable).toBe(false)
    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "stale_baseline", hard: true }),
    ]))
    expect(() => createBranchProposalSeed(input.branch, result)).toThrow(/non-viable/)
  })

  it("detects forward causes and POV knowledge leakage", () => {
    const input = scenario()
    input.candidateEvents[0] = {
      ...input.candidateEvents[0]!,
      causes: ["future-event"],
    }
    input.constraints = [{
      id: "knowledge-secret",
      kind: "knowledge_required",
      eventId: "candidate-1",
      subjectId: "character-a",
      claimId: "secret-1",
      allowedStances: ["knows"],
    }]
    const result = simulateBranch(input)

    expect(result.viable).toBe(false)
    expect(result.violations.map((item) => item.kind)).toEqual(expect.arrayContaining([
      "missing_or_forward_cause",
      "knowledge_leakage",
    ]))
  })

  it("reports state conflicts and refuses a declared delta that differs from replay", () => {
    const input = scenario()
    input.candidateEvents[0] = {
      ...input.candidateEvents[0]!,
      effects: [{
        entityId: "character-a",
        fieldPath: "location",
        operation: "set",
        previous: "harbor",
        next: "archive",
      }],
    }
    const result = simulateBranch(input)

    expect(result.viable).toBe(false)
    expect(result.metrics.projectionConflicts).toBe(1)
    expect(result.violations.map((item) => item.kind)).toEqual(expect.arrayContaining([
      "projection_conflict",
      "state_delta_mismatch",
    ]))
  })

  it("ranks viable branches before higher-scoring but invalid alternatives", () => {
    const viableInput = scenario()
    const invalidInput = scenario("branch-b")
    invalidInput.branch.baselineCanonHash = "stale"
    invalidInput.branch.foreshadowImpacts = Array.from({ length: 20 }, (_, index) => `impact-${index}`)

    const ranked = rankBranchCandidates([simulateBranch(invalidInput), simulateBranch(viableInput)])
    expect(ranked.map((item) => item.branchId)).toEqual(["branch-a", "branch-b"])
  })

  it("rejects a selected branch as an input because selection happens after simulation", () => {
    const input = scenario()
    input.branch.status = "selected"
    expect(() => simulateBranch(input)).toThrow(/only sandbox branches/)
  })

  it("blocks unresolved declared conflicts and a cause that occurs in the future", () => {
    const input = scenario()
    input.branch.conflicts = ["角色在同一时刻位于两个地点"]
    input.baselineEvents.push(event("future-baseline", 3, "confirmed", []))
    input.branch.baselineCanonHash = baselineCanonHash(input.baselineEvents, input.baselineKnowledge)
    input.candidateEvents[0] = { ...input.candidateEvents[0]!, causes: ["future-baseline"] }

    const result = simulateBranch(input)
    expect(result.viable).toBe(false)
    expect(result.metrics.declaredConflicts).toBe(1)
    expect(result.violations.map((item) => item.kind)).toEqual(expect.arrayContaining([
      "declared_conflict",
      "missing_or_forward_cause",
    ]))
  })
})

function scenario(branchId = "branch-a"): BranchSimulationInput {
  const baselineEvents = [event("baseline-1", 1, "confirmed", [{
    entityId: "character-a",
    fieldPath: "location",
    operation: "set",
    next: "station",
  }])]
  const baselineKnowledge = [claim("knowledge-1", 1, "suspects")]
  const stateDelta: EntityStateTransition[] = [{
    entityId: "character-a",
    fieldPath: "location",
    operation: "set",
    previous: "station",
    next: "archive",
  }]
  const branch: BranchHypothesis = {
    id: branchId,
    baselineCanonHash: baselineCanonHash(baselineEvents, baselineKnowledge),
    status: "sandbox",
    hypothesis: "角色进入档案馆核对会变化的地图。",
    candidateEventIds: ["candidate-1"],
    stateDelta,
    costs: ["暴露调查意图"],
    conflicts: [],
    foreshadowImpacts: ["七码头线索得到强化"],
  }
  return {
    branch,
    baselineEvents,
    baselineKnowledge,
    candidateEvents: [event("candidate-1", 2, "candidate", stateDelta, ["baseline-1"])],
    constraints: [
      {
        id: "baseline-before-candidate",
        kind: "event_order",
        beforeEventId: "baseline-1",
        afterEventId: "candidate-1",
      },
      {
        id: "starts-at-station",
        kind: "state_precondition",
        eventId: "candidate-1",
        entityId: "character-a",
        fieldPath: "location",
        expected: "station",
      },
      {
        id: "character-suspects-secret",
        kind: "knowledge_required",
        eventId: "candidate-1",
        subjectId: "character-a",
        claimId: "secret-1",
        allowedStances: ["suspects", "knows"],
      },
    ],
    throughSequence: 2,
  }
}

function event(
  id: string,
  sequence: number,
  lifecycle: StoryEvent["lifecycle"],
  effects: StoryEvent["effects"],
  causes: string[] = [],
): StoryEvent {
  return {
    id,
    eventType: "state_change",
    lifecycle,
    storyTime: { sequence },
    narrativePosition: { chapterIndex: 1, order: sequence },
    validity: { fromSequence: 0 },
    participants: ["character-a"],
    causes,
    effects,
    evidence,
    recordedAt: "2026-08-21T00:00:00Z",
  }
}

function claim(id: string, sequence: number, stance: KnowledgeClaim["stance"]): KnowledgeClaim {
  return {
    id,
    claimId: "secret-1",
    subjectId: "character-a",
    stance,
    confidence: 0.7,
    lifecycle: "confirmed",
    acquiredAt: { sequence },
    evidence,
    visibilityScope: ["character-a"],
  }
}
