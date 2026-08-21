import type { ISessions, IWorkspaces } from "@deepseek-ai/dsh-client-runtime/client"
import type { NovelWorkbenchController, WorkbenchTarget } from "./controller.js"

export interface WorkbenchSelectionSources {
  sessions: Pick<ISessions, "list">
  workspaces: Pick<IWorkspaces, "list">
}

export function selectedWorkbenchTarget(sources: WorkbenchSelectionSources): WorkbenchTarget | undefined {
  const sessions = sources.sessions.list.getSnapshot()
  const workspaces = sources.workspaces.list.getSnapshot()
  const current = sessions.current
  const selected = current === undefined
    ? workspaces.items.find((workspace) => workspace.workspaceId === workspaces.recentWorkspaceId)
    : workspaces.items.find((workspace) => workspace.sessionIds.includes(current))
  if (selected === undefined) return undefined
  return { workspaceId: String(selected.workspaceId), title: selected.title }
}

export function observeWorkbenchSelection(
  sources: WorkbenchSelectionSources,
  controller: Pick<NovelWorkbenchController, "setTarget">,
): () => void {
  const update = (): void => { controller.setTarget(selectedWorkbenchTarget(sources)) }
  const stopSessions = sources.sessions.list.subscribe(update)
  const stopWorkspaces = sources.workspaces.list.subscribe(update)
  update()
  return () => {
    stopSessions()
    stopWorkspaces()
  }
}
