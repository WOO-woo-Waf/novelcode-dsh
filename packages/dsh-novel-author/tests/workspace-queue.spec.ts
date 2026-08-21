import { describe, expect, it } from "vitest"
import { WorkspaceOperationQueue } from "../src/workspace-queue.js"

describe("workspace operation queue", () => {
  it("serializes state-changing work for one workspace without blocking another", async () => {
    const queue = new WorkspaceOperationQueue()
    const events: string[] = []
    let releaseFirst = (): void => {}
    let markStarted = (): void => {}
    const started = new Promise<void>((resolve) => { markStarted = resolve })
    const blocker = new Promise<void>((resolve) => { releaseFirst = resolve })
    const signal = new AbortController().signal
    const first = queue.run("workspace-a", signal, async () => {
      events.push("a:first:start")
      markStarted()
      await blocker
      events.push("a:first:end")
    })
    await started
    const second = queue.run("workspace-a", signal, async () => {
      events.push("a:second")
    })
    const other = queue.run("workspace-b", signal, async () => {
      events.push("b:first")
    })
    await other
    expect(events).toEqual(["a:first:start", "b:first"])
    releaseFirst()
    await Promise.all([first, second])
    expect(events).toEqual(["a:first:start", "b:first", "a:first:end", "a:second"])
    expect(queue.pendingWorkspaces()).toBe(0)
  })

  it("honors cancellation while an operation waits for the workspace", async () => {
    const queue = new WorkspaceOperationQueue()
    let releaseFirst = (): void => {}
    let markStarted = (): void => {}
    const started = new Promise<void>((resolve) => { markStarted = resolve })
    const blocker = new Promise<void>((resolve) => { releaseFirst = resolve })
    const first = queue.run("workspace", new AbortController().signal, async () => {
      markStarted()
      await blocker
    })
    await started
    const controller = new AbortController()
    const second = queue.run("workspace", controller.signal, async () => "should-not-run")
    controller.abort(new Error("cancelled"))
    releaseFirst()
    await first
    await expect(second).rejects.toThrow(/cancelled/)
  })
})
