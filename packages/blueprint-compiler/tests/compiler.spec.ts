import { describe, expect, it } from "vitest"
import type { EntityStateTransition } from "@novelcode-dsh/memory-model"
import type { BranchProposalSeed, BranchSimulationResult } from "@novelcode-dsh/simulation"
import {
  compileBranchBlueprint,
  worldDeltaRef,
  type BranchBlueprintCompilationInput,
  type ChapterBlueprintDraft,
} from "../src/index.js"

const delta: EntityStateTransition = {
  entityId: "character-a",
  fieldPath: "location",
  operation: "set",
  previous: "station",
  next: "archive",
}

describe("branch Blueprint compiler", () => {
  it("compiles a viable current seed into V2 requests without promoting either candidate", () => {
    const result = compileBranchBlueprint(input())

    expect(result.blueprintProposal).toMatchObject({
      action: "narrative_blueprint_propose",
      payload: {
        blueprint_id: "chapter-002",
        chapter_index: 2,
        segments: [{
          segment_id: "segment-01",
          information_state: {
            pov_knows: ["地图会随持有人变化"],
            withheld: ["谁在改写记录"],
          },
        }],
      },
    })
    expect(result.provenanceProposal).toMatchObject({
      action: "narrative_memory_propose",
      payload: {
        data: {
          source_branch_id: "branch-a",
          baseline_canon_hash: "canon-hash",
          planned_blueprint_id: "chapter-002",
          promotion_boundary: "proposal_only",
        },
      },
    })
    expect(JSON.stringify(result)).not.toContain("author_confirmed")
  })

  it("rejects non-viable and stale simulation evidence", () => {
    const nonViable = input()
    nonViable.simulation.viable = false
    expect(() => compileBranchBlueprint(nonViable)).toThrow(/non-viable/)

    const stale = input()
    stale.currentBaselineCanonHash = "new-canon-hash"
    expect(() => compileBranchBlueprint(stale)).toThrow(/stale/)
  })

  it("requires segments, information boundaries, and complete world-delta ownership", () => {
    const missingSegments = input()
    missingSegments.chapter.segments = []
    expect(() => compileBranchBlueprint(missingSegments)).toThrow(/at least one segment/)

    const missingInformation = input()
    missingInformation.chapter.segments[0]!.informationState = { readerKnows: [], povKnows: [], withheld: [] }
    expect(() => compileBranchBlueprint(missingInformation)).toThrow(/information boundary/)

    const missingDelta = input()
    missingDelta.chapter.segments[0]!.worldDeltaRefs = []
    expect(() => compileBranchBlueprint(missingDelta)).toThrow(/not covered/)

    const missingRequiredChange = input()
    missingRequiredChange.chapter.segments[0]!.requiredChanges = []
    expect(() => compileBranchBlueprint(missingRequiredChange)).toThrow(/no requiredChanges/)
  })
})

function input(): BranchBlueprintCompilationInput {
  const seed: BranchProposalSeed = {
    schema: "novelcode-branch-proposal-v1",
    sourceBranchId: "branch-a",
    baselineCanonHash: "canon-hash",
    hypothesis: "进入档案馆交叉验证变化地图。",
    candidateEventIds: ["candidate-1"],
    worldDelta: [delta],
    costs: ["暴露调查意图"],
    foreshadowImpacts: ["七码头线索强化"],
  }
  const simulation: BranchSimulationResult = {
    branchId: "branch-a",
    baselineCanonHash: "canon-hash",
    viable: true,
    baseline: { throughSequence: 1, values: {}, appliedEventIds: [], conflicts: [] },
    projected: { throughSequence: 2, values: { "character-a:location": "archive" }, appliedEventIds: ["candidate-1"], conflicts: [] },
    worldDelta: [delta],
    violations: [],
    metrics: {
      hardViolations: 0,
      softViolations: 0,
      projectionConflicts: 0,
      costs: 1,
      foreshadowImpacts: 1,
      declaredConflicts: 0,
      score: 99,
    },
  }
  return {
    seed,
    simulation,
    currentBaselineCanonHash: "canon-hash",
    chapter: chapter(),
  }
}

function chapter(): ChapterBlueprintDraft {
  return {
    blueprintId: "chapter-002",
    title: "地图换手",
    chapterIndex: 2,
    chapterFunction: "让主角验证记录变化规则并支付暴露调查的代价。",
    entryState: "主角只握有一份异常地图。",
    exitState: "主角进入档案馆并留下交叉证据。",
    requiredChanges: ["角色从车站进入档案馆"],
    forbiddenChanges: ["不揭示记录改写者"],
    reveals: ["地图会随持有人变化"],
    withheldInformation: ["谁在改写记录"],
    relationshipPressure: ["搭档开始质疑调查动机"],
    trackerMoves: ["七码头线索强化"],
    segments: [{
      segmentId: "segment-01",
      title: "进入档案馆",
      goal: "取得第二份地图完成交叉验证。",
      entryState: "角色仍在车站。",
      exitState: "角色抵达档案馆。",
      requiredChanges: ["角色 location 从 station 变为 archive"],
      forbiddenChanges: ["不解释异常机制"],
      worldDeltaRefs: [worldDeltaRef(delta)],
      sceneMode: "investigation",
      eventFunction: "rule_revelation",
      pov: "character-a",
      narrator: "third_person_limited",
      participants: ["character-a"],
      relationshipPattern: "fragile_trust",
      informationState: {
        readerKnows: ["地图岸线不同"],
        povKnows: ["地图会随持有人变化"],
        withheld: ["谁在改写记录"],
      },
      pressureCurve: "steady_then_spike",
      intendedReaderEffects: ["unease"],
      representationNeeds: ["spatial_evidence"],
      targetChars: 120,
      minChars: 80,
    }],
  }
}
