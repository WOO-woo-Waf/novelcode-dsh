import { describe, expect, it, vi } from "vitest"
import { observeWorkbenchSelection, selectedWorkbenchTarget, type WorkbenchSelectionSources } from "../src/client/selection.js"

function sources(current?: string): WorkbenchSelectionSources {
  return {
    sessions: { list: { getSnapshot: () => ({ current }), subscribe: () => () => {} } },
    workspaces: { list: {
      getSnapshot: () => ({ items: [
        { workspaceId: "first", title: "第一部", sessionIds: ["session-1"] },
        { workspaceId: "second", title: "第二部", sessionIds: ["session-2"] },
      ] }),
      subscribe: () => () => {},
    } },
  } as unknown as WorkbenchSelectionSources
}

describe("alpha.2 workbench selection", () => {
  it("resolves the selected session's novel instead of the first workspace", () => {
    expect(selectedWorkbenchTarget(sources("session-2"))).toEqual({ workspaceId: "second", title: "第二部" })
  })

  it("uses Host workspace order when no session is selected", () => {
    expect(selectedWorkbenchTarget(sources())).toEqual({ workspaceId: "first", title: "第一部" })
  })

  it("does not substitute another novel for an unknown session", () => {
    expect(selectedWorkbenchTarget(sources("unknown"))).toBeUndefined()
  })

  it("subscribes to both controllers and releases both subscriptions", () => {
    const input = sources("session-2")
    const stopSession = vi.fn()
    const stopWorkspace = vi.fn()
    input.sessions.list.subscribe = vi.fn(() => stopSession)
    input.workspaces.list.subscribe = vi.fn(() => stopWorkspace)
    const setTarget = vi.fn()
    const dispose = observeWorkbenchSelection(input, { setTarget })
    expect(setTarget).toHaveBeenCalledWith({ workspaceId: "second", title: "第二部" })
    dispose()
    expect(stopSession).toHaveBeenCalledOnce()
    expect(stopWorkspace).toHaveBeenCalledOnce()
  })
})
