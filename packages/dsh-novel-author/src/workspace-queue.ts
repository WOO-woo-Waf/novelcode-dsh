export class WorkspaceOperationQueue {
  private readonly tails = new Map<string, Promise<void>>()

  async run<T>(workspace: string, signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    const prior = this.tails.get(workspace) ?? Promise.resolve()
    let release = (): void => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const current = prior.catch(() => {}).then(async () => gate)
    this.tails.set(workspace, current)
    await prior.catch(() => {})
    try {
      if (signal.aborted) throw signal.reason ?? new Error("workspace operation aborted while queued")
      return await operation()
    } finally {
      release()
      if (this.tails.get(workspace) === current) this.tails.delete(workspace)
    }
  }

  pendingWorkspaces(): number {
    return this.tails.size
  }
}
