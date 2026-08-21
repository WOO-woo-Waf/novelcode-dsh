import type { NovelWorkbenchSnapshot } from "../types.js"

export const WORKBENCH_PANELS = [
  "project",
  "sources",
  "memory",
  "planning",
  "style",
  "writing",
  "versions",
] as const

export type WorkbenchPanel = (typeof WORKBENCH_PANELS)[number]

export interface WorkbenchTarget {
  workspaceId: string
  title: string
}

export interface WorkbenchState {
  open: boolean
  status: "idle" | "unbound" | "loading" | "ready" | "error" | "disconnected"
  activePanel: WorkbenchPanel
  target?: WorkbenchTarget
  snapshot?: NovelWorkbenchSnapshot
  error?: string
}

export interface WorkbenchPort {
  read(workspaceId: string, signal: AbortSignal): Promise<NovelWorkbenchSnapshot>
}

export class WorkbenchDisconnectedError extends Error {
  override readonly name = "WorkbenchDisconnectedError"
}

export class NovelWorkbenchController {
  private state: WorkbenchState = { open: false, status: "idle", activePanel: "project" }
  private readonly listeners = new Set<() => void>()
  private active: AbortController | undefined
  private generation = 0

  constructor(
    private readonly port: WorkbenchPort,
    private readonly reportError: (error: unknown) => void = () => {},
  ) {}

  getSnapshot = (): WorkbenchState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  setTarget(target: WorkbenchTarget | undefined): void {
    if (sameTarget(this.state.target, target)) return
    this.cancel()
    this.publish({
      open: this.state.open,
      status: target === undefined ? "unbound" : "idle",
      activePanel: this.state.activePanel,
      ...(target === undefined ? {} : { target }),
    })
    if (this.state.open && target !== undefined) void this.refresh()
  }

  async open(): Promise<void> {
    if (!this.state.open) this.publish({ ...this.state, open: true })
    if (this.state.target === undefined) {
      this.publish({ ...this.state, status: "unbound" })
      return
    }
    await this.refresh()
  }

  close(): void {
    this.cancel()
    this.publish({ ...this.state, open: false })
  }

  selectPanel(panel: WorkbenchPanel): void {
    if (this.state.activePanel === panel) return
    this.publish({ ...this.state, activePanel: panel })
  }

  async refresh(): Promise<void> {
    const target = this.state.target
    if (target === undefined) {
      this.publish({ ...this.state, status: "unbound" })
      return
    }
    this.cancel()
    const controller = new AbortController()
    const generation = ++this.generation
    this.active = controller
    const { error: _loadingError, ...loadingState } = this.state
    this.publish({ ...loadingState, status: "loading" })
    try {
      const snapshot = await this.port.read(target.workspaceId, controller.signal)
      if (controller.signal.aborted || generation !== this.generation) return
      this.active = undefined
      const { error: _readyError, ...readyState } = this.state
      this.publish({ ...readyState, status: "ready", snapshot })
    } catch (error) {
      if (controller.signal.aborted || generation !== this.generation) return
      this.active = undefined
      const disconnected = error instanceof WorkbenchDisconnectedError
      this.publish({
        ...this.state,
        status: disconnected ? "disconnected" : "error",
        error: error instanceof Error ? error.message : String(error),
      })
      this.reportError(error)
    }
  }

  disconnected(): void {
    this.cancel()
    this.publish({ ...this.state, status: "disconnected", error: "DSH Host connection unavailable" })
  }

  dispose(): void {
    this.cancel()
    this.listeners.clear()
  }

  private cancel(): void {
    this.generation += 1
    this.active?.abort()
    this.active = undefined
  }

  private publish(next: WorkbenchState): void {
    this.state = next
    for (const listener of [...this.listeners]) listener()
  }
}

function sameTarget(left: WorkbenchTarget | undefined, right: WorkbenchTarget | undefined): boolean {
  return left?.workspaceId === right?.workspaceId && left?.title === right?.title
}
