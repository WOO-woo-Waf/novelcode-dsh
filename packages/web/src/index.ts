import type { Context } from "@deepseek-ai/cordis"
import type { ConnectionRpcHandler, HostConnectionHandle } from "@deepseek-ai/dsh-client-connection"
import { WorkspaceId, type Workspace } from "@deepseek-ai/dsh-workspace"
import { isNovelWorkbenchWorkspace, readNovelWorkbenchSnapshot } from "./snapshot.js"

export * from "./snapshot.js"
export * from "./types.js"

export const name = "novelcode-workbench"
export const inject = ["connection", "workspaceRegistry"]

export interface NovelWorkspaceRegistry {
  get(workspaceId: WorkspaceId): Pick<Workspace, "path"> | undefined
}

function badRequest(message: string): Awaited<ReturnType<ConnectionRpcHandler>> {
  return { ok: false, error: { code: "bad-request", message, details: { issues: [] } } }
}

function internalFailure(): Awaited<ReturnType<ConnectionRpcHandler>> {
  return { ok: false, error: { code: "internal", message: "NovelCode workbench snapshot failed", details: {} } }
}

function snapshotRequest(value: unknown): { workspaceId: WorkspaceId } | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== 1 || typeof record.workspaceId !== "string") return undefined
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(record.workspaceId)) {
    return undefined
  }
  return { workspaceId: WorkspaceId(record.workspaceId) }
}

export function createNovelWorkbenchRpcHandler(
  workspaces: NovelWorkspaceRegistry,
  reportFailure: (error: unknown) => void = () => {},
): ConnectionRpcHandler {
  return async (endpoint, payload, signal) => {
    if (endpoint !== "snapshot/read") return badRequest(`Unknown NovelCode workbench endpoint: ${endpoint}`)
    const request = snapshotRequest(payload)
    if (request === undefined) return badRequest("Snapshot payload must contain only a Workspace UUID")
    const workspace = workspaces.get(request.workspaceId)
    if (workspace === undefined) return badRequest(`Unknown Workspace: ${request.workspaceId}`)
    try {
      if (!await isNovelWorkbenchWorkspace(workspace.path)) {
        return badRequest("Workspace is not bound to NovelCode DSH")
      }
      return { ok: true, value: await readNovelWorkbenchSnapshot(workspace.path, signal) }
    } catch (error) {
      if (signal.aborted) {
        return { ok: false, error: { code: "cancelled", message: "Workbench snapshot was cancelled", details: {} } }
      }
      try {
        reportFailure(error)
      } catch {
        // Reporting is diagnostic-only and must not alter the stable RPC result.
      }
      return internalFailure()
    }
  }
}

export function apply(ctx: Context): void {
  const connection = ctx.get("connection") as HostConnectionHandle
  const workspaces = ctx.get("workspaceRegistry") as NovelWorkspaceRegistry
  ctx.effect(
    () => connection.rpc.handle(
      "/novelcode-workbench",
      createNovelWorkbenchRpcHandler(
        workspaces,
        (error) => { ctx.logger.error("novelcode-workbench snapshot failed: %o", error) },
      ),
      { authority: "loopback" },
    ),
    "novelcode-workbench: read-only snapshot RPC",
  )
}
