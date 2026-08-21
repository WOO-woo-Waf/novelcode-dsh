import { describe, expect, it } from "vitest"
import {
  NARRATIVE_V2_ACTIONS,
  actionBelongsToTool,
  isHighRiskNarrativeAction,
} from "../src/index.js"

describe("Narrative V2 contract", () => {
  it("freezes exactly 35 unique actions", () => {
    expect(NARRATIVE_V2_ACTIONS).toHaveLength(35)
    expect(new Set(NARRATIVE_V2_ACTIONS).size).toBe(35)
  })

  it("maps every action to exactly one model-facing tool", () => {
    const tools = [
      "narrative_project",
      "narrative_source",
      "narrative_memory",
      "narrative_plan",
      "narrative_writing",
    ] as const

    for (const action of NARRATIVE_V2_ACTIONS) {
      expect(tools.filter((tool) => actionBelongsToTool(tool, action))).toHaveLength(1)
    }
  })

  it("keeps author-controlled transitions high risk", () => {
    expect(isHighRiskNarrativeAction("narrative_memory_confirm")).toBe(true)
    expect(isHighRiskNarrativeAction("narrative_blueprint_confirm")).toBe(true)
    expect(isHighRiskNarrativeAction("narrative_chapter_approve")).toBe(true)
    expect(isHighRiskNarrativeAction("narrative_memory_search")).toBe(false)
  })
})
