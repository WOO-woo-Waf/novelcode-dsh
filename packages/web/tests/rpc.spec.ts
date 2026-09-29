import { Context } from "@deepseek-ai/cordis"
import type { ConnectionRpcHandler, HostConnectionHandle } from "@deepseek-ai/dsh-client-connection"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { apply, inject } from "../src/index.js"

const WORKSPACE_ID = "123e4567-e89b-42d3-a456-426614174000"

describe("NovelCode workbench Host RPC", () => {
  it("registers the alpha.2 read channel and resolves opaque Workspace identity", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "novelcode-web-rpc-"))
    await mkdir(join(workspace, ".novelcode"), { recursive: true })
    await writeFile(join(workspace, ".novelcode/noveldsh.json"), JSON.stringify({
      schema: "novelcode-dsh-workspace/v1",
      product: "novelcode-dsh",
      scope: "single-novel",
    }), "utf8")
    let handler: ConnectionRpcHandler | undefined
    const dispose = vi.fn(async () => {})
    const handle = vi.fn((channel: string, candidate: ConnectionRpcHandler) => {
      expect(channel).toBe("/novelcode-workbench")
      handler = candidate
      return dispose
    })
    const ctx = new Context()
    ctx.provide("connection", { rpc: { handle } } as unknown as HostConnectionHandle)
    ctx.provide("workspaceRegistry" as never, {
      get: (id: string) => id === WORKSPACE_ID ? { path: workspace } : undefined,
    } as never)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    try {
      const signal = new AbortController().signal
      await expect(handler?.("snapshot/read", { workspaceId: WORKSPACE_ID }, signal)).resolves.toMatchObject({
        ok: true,
        value: { schema: "novelcode-workbench-snapshot-v1", workspace: { mode: "marker_only" } },
      })
      await expect(handler?.("snapshot/read", { workspaceId: "../escape" }, signal)).resolves.toMatchObject({
        ok: false,
        error: { code: "bad-request" },
      })
      await expect(handler?.("write", { workspaceId: WORKSPACE_ID }, signal)).resolves.toMatchObject({
        ok: false,
        error: { code: "bad-request" },
      })
    } finally {
      await fiber.dispose()
      await rm(workspace, { recursive: true, force: true })
    }
    expect(dispose).toHaveBeenCalledOnce()
  })
})
