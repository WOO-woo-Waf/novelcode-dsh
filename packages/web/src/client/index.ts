import type { ClientConnectionRpc, ConnectionHandle } from "@deepseek-ai/dsh-client-connection/client"
import type { ClientContext, ISessions, IWorkspaces } from "@deepseek-ai/dsh-client-runtime/client"
import type {} from "@deepseek-ai/dsh-client-ui-layout/client"
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client"
import { NOVEL_WORKBENCH_SNAPSHOT_SCHEMA, type NovelWorkbenchSnapshot } from "../types.js"
import {
  NovelWorkbenchController,
  WorkbenchDisconnectedError,
  type WorkbenchPort,
} from "./controller.js"
import { observeWorkbenchSelection } from "./selection.js"
import { installWorkbenchStyle } from "./style.js"
import { NovelWorkbenchOverlay, NovelWorkbenchTrigger, type WorkbenchInjected } from "./view.js"

export * from "./controller.js"
export * from "./selection.js"
export * from "./style.js"
export * from "./view.js"

export const inject = ["slots", "connection", "sessions", "workspaces"]

function parseSnapshot(value: unknown): NovelWorkbenchSnapshot {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("NovelCode workbench response is not an object")
  }
  const candidate = value as Partial<NovelWorkbenchSnapshot>
  if (candidate.schema !== NOVEL_WORKBENCH_SNAPSHOT_SCHEMA
    || candidate.project === undefined
    || candidate.memory === undefined
    || !Array.isArray(candidate.warnings)) {
    throw new Error("NovelCode workbench response has an unsupported schema")
  }
  return candidate as NovelWorkbenchSnapshot
}

export function createWorkbenchPort(rpc: Pick<ClientConnectionRpc, "call">): WorkbenchPort {
  return {
    read: async (workspaceId, signal) => {
      let result
      try {
        result = await rpc.call("/novelcode-workbench", "snapshot/read", { workspaceId }, signal)
      } catch (error) {
        throw new WorkbenchDisconnectedError(error instanceof Error ? error.message : String(error))
      }
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      return parseSnapshot(result.value)
    },
  }
}

export function apply(ctx: ClientContext): void {
  const connection = ctx.get("connection") as unknown as ConnectionHandle
  const sessions = ctx.get("sessions" as never) as ISessions | undefined
  const workspaces = ctx.get("workspaces" as never) as IWorkspaces | undefined
  if (sessions === undefined || workspaces === undefined) {
    throw new Error("NovelCode workbench requires browser Session and Workspace services")
  }
  const controller = new NovelWorkbenchController(
    createWorkbenchPort(connection.rpc),
    (error) => { ctx.logger.warn(error) },
  )
  ctx.effect(() => {
    const stopSelection = observeWorkbenchSelection({ sessions, workspaces }, controller)
    return () => {
      stopSelection()
      controller.dispose()
    }
  }, "novelcode-workbench: selection lifecycle")
  if (typeof document !== "undefined") {
    ctx.effect(() => installWorkbenchStyle(document), "novelcode-workbench: styles")
  }
  ctx.effect(() => {
    const refresh = (): void => {
      if (connection.hostDescription.getSnapshot() === undefined) {
        controller.disconnected()
      } else if (controller.getSnapshot().open) {
        void controller.refresh()
      }
    }
    const stopDescription = connection.hostDescription.subscribe(refresh)
    const stopReset = ctx.on("connection/reset", refresh)
    return () => {
      stopDescription()
      stopReset()
    }
  }, "novelcode-workbench: connection recovery")

  const injected = (): WorkbenchInjected => ({ controller })
  ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
    name: "sidebar.footer.action",
    id: "novelcode-workbench",
    order: 85,
    label: "小说工作台",
    inject: injected,
  }, NovelWorkbenchTrigger))
  ctx.slots.inject("shell.overlay", () => ctx.slots.register({
    name: "shell.overlay",
    id: "novelcode-workbench",
    order: 85,
    inject: injected,
  }, NovelWorkbenchOverlay))
}
