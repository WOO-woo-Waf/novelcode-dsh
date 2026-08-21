import { Context, Service } from "@deepseek-ai/cordis"
import type { ConnectionHandle } from "@deepseek-ai/dsh-client-connection/client"
import { describe, expect, it, vi } from "vitest"
import { apply, inject } from "../src/client/index.js"

describe("NovelCode workbench browser composition", () => {
  it("registers and disposes the native sidebar and shell overlay entries", async () => {
    const ctx = new Context()
    const entries: Array<{ name: string; id?: string }> = []
    class TestSlots extends Service {
      constructor(owner: Context) { super(owner, "slots") }
      inject(_name: string, mount: () => () => void): void {
        this.ctx.effect(mount, "test slot injection")
      }
      register(options: { name: string; id?: string }): () => void {
        const entry = { name: options.name, ...(options.id === undefined ? {} : { id: options.id }) }
        entries.push(entry)
        return () => { entries.splice(entries.indexOf(entry), 1) }
      }
    }
    new TestSlots(ctx)
    const sessionList = observable({ current: undefined })
    const workspaceList = observable({ items: [], recentWorkspaceId: undefined })
    ctx.provide("sessions" as never, { list: sessionList } as never)
    ctx.provide("workspaces" as never, { list: workspaceList } as never)
    ctx.provide("connection" as never, {
      rpc: { call: vi.fn() },
      hostDescription: { getSnapshot: () => ({}), subscribe: () => () => {} },
    } as unknown as ConnectionHandle as never)

    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(entries).toEqual(expect.arrayContaining([
      { name: "sidebar.footer.action", id: "novelcode-workbench" },
      { name: "shell.overlay", id: "novelcode-workbench" },
    ]))
    await fiber.dispose()
    expect(entries).toEqual([])
  })
})

function observable<T>(value: T) {
  return {
    getSnapshot: () => value,
    subscribe: (_listener: () => void) => () => {},
  }
}
