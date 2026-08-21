import { describe, expect, it } from "vitest"
import { eventForAction, operationalEventData } from "../src/events.js"

describe("novel session events", () => {
  it("maps domain actions without recording payload bodies", () => {
    expect(eventForAction("narrative_memory_confirm")).toBe("novel/memory-transition")
    expect(eventForAction("narrative_chapter_approve")).toBe("novel/chapter-revision")
    expect(operationalEventData("narrative_memory_confirm", {
      success: true,
      summary: "confirmed",
      artifacts: [".narrative/brain/l1/character.md"],
      metrics: { confirmed: 1 },
      payload: { private_body: "must not enter session event" },
    })).toEqual({
      action: "narrative_memory_confirm",
      success: true,
      artifacts: [".narrative/brain/l1/character.md"],
      metricKeys: ["confirmed"],
    })
  })
})
