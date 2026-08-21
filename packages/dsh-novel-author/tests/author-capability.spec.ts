import { describe, expect, it } from "vitest"
import { AuthorCapabilityStore } from "../src/author-capability.js"

describe("AuthorCapabilityStore", () => {
  it("consumes an exact capability once", () => {
    const store = new AuthorCapabilityStore()
    const input = {
      callId: "call-1",
      sessionId: "session-1",
      action: "narrative_memory_confirm" as const,
      arguments: { action: "narrative_memory_confirm", payload: { proposal_id: "p1" } },
    }
    store.prepare(input)
    expect(store.consume(input)).toBe(true)
    expect(store.consume(input)).toBe(false)
  })

  it("rejects changed proposal arguments", () => {
    const store = new AuthorCapabilityStore()
    const input = {
      callId: "call-2",
      sessionId: "session-1",
      action: "narrative_blueprint_confirm" as const,
      arguments: { action: "narrative_blueprint_confirm", payload: { proposal_id: "bp1" } },
    }
    store.prepare(input)
    expect(store.consume({
      ...input,
      arguments: { action: "narrative_blueprint_confirm", payload: { proposal_id: "bp2" } },
    })).toBe(false)
  })

  it("expires capabilities", () => {
    let now = 1_000
    const store = new AuthorCapabilityStore(10, () => now)
    const input = {
      callId: "call-3",
      action: "narrative_chapter_approve" as const,
      arguments: { action: "narrative_chapter_approve" },
    }
    store.prepare(input)
    now = 1_011
    expect(store.consume(input)).toBe(false)
  })
})
