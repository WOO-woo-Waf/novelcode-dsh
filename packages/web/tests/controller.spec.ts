import { describe, expect, it, vi } from "vitest"
import { NOVEL_WORKBENCH_SNAPSHOT_SCHEMA, type NovelWorkbenchSnapshot } from "../src/types.js"
import { NovelWorkbenchController } from "../src/client/controller.js"

const snapshot = {
  schema: NOVEL_WORKBENCH_SNAPSHOT_SCHEMA,
  generatedAt: "2026-08-21T00:00:00.000Z",
  project: {},
  memory: {},
  warnings: [],
} as unknown as NovelWorkbenchSnapshot

describe("NovelCode workbench controller", () => {
  it("loads only the selected workspace and cancels a stale read", async () => {
    const pending = new Map<string, { signal: AbortSignal; resolve: (value: NovelWorkbenchSnapshot) => void }>()
    const read = vi.fn((workspaceId: string, signal: AbortSignal) => new Promise<NovelWorkbenchSnapshot>((resolve, reject) => {
      signal.addEventListener("abort", () => { reject(new Error("cancelled")) }, { once: true })
      pending.set(workspaceId, { signal, resolve })
    }))
    const controller = new NovelWorkbenchController({ read })
    controller.setTarget({ workspaceId: "workspace-a", title: "A" })
    const opening = controller.open()
    await vi.waitFor(() => { expect(pending.has("workspace-a")).toBe(true) })

    controller.setTarget({ workspaceId: "workspace-b", title: "B" })
    await vi.waitFor(() => { expect(pending.has("workspace-b")).toBe(true) })
    expect(pending.get("workspace-a")?.signal.aborted).toBe(true)
    pending.get("workspace-b")?.resolve(snapshot)
    await vi.waitFor(() => { expect(controller.getSnapshot().status).toBe("ready") })
    expect(controller.getSnapshot()).toMatchObject({ target: { workspaceId: "workspace-b" }, snapshot })
    await opening
  })

  it("keeps panel selection local and reports the unbound state", async () => {
    const controller = new NovelWorkbenchController({ read: vi.fn() })
    await controller.open()
    expect(controller.getSnapshot()).toMatchObject({ open: true, status: "unbound" })
    controller.selectPanel("memory")
    expect(controller.getSnapshot().activePanel).toBe("memory")
    controller.close()
    expect(controller.getSnapshot().open).toBe(false)
  })
})
