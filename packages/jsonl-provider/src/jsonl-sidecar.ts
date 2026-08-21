import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { randomUUID } from "node:crypto"
import { realpath } from "node:fs/promises"
import { resolve } from "node:path"
import { createInterface } from "node:readline"
import type { NarrativeToolInput, NarrativeToolResult } from "@novelcode-dsh/contracts"

export interface SidecarLaunch {
  command: string
  args: string[]
  env?: NodeJS.ProcessEnv
}

export interface JsonlSidecarProviderConfig {
  launch: SidecarLaunch | ((workspace: string) => SidecarLaunch)
  requestTimeoutMs?: number
  stderrLimitBytes?: number
}

export interface NarrativeExecutionContext {
  workspace: string
  signal?: AbortSignal
}

export interface SidecarReadiness {
  workspace: string
  running: boolean
  pid?: number
  pendingRequests: number
  stderrTail: string
}

interface ServiceResponse {
  id?: string
  result?: NarrativeToolResult
}

interface PendingRequest {
  resolve: (result: NarrativeToolResult) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
  removeAbort?: () => void
}

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000
const DEFAULT_STDERR_LIMIT_BYTES = 16_384

export class NarrativeSidecarError extends Error {
  override readonly name = "NarrativeSidecarError"

  constructor(
    message: string,
    readonly code:
      | "INVALID_CONFIG"
      | "INVALID_WORKSPACE"
      | "SPAWN_FAILED"
      | "PROTOCOL_ERROR"
      | "PROCESS_EXITED"
      | "REQUEST_ABORTED"
      | "REQUEST_TIMEOUT",
  ) {
    super(message)
  }
}

export class JsonlSidecarProvider {
  private readonly sidecars = new Map<string, WorkspaceSidecar>()
  private readonly requestTimeoutMs: number
  private readonly stderrLimitBytes: number

  constructor(private readonly config: JsonlSidecarProviderConfig) {
    this.requestTimeoutMs = positiveInteger(
      "requestTimeoutMs",
      config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    )
    this.stderrLimitBytes = positiveInteger(
      "stderrLimitBytes",
      config.stderrLimitBytes ?? DEFAULT_STDERR_LIMIT_BYTES,
    )
  }

  async execute(
    input: NarrativeToolInput,
    context: NarrativeExecutionContext,
  ): Promise<NarrativeToolResult> {
    const workspace = await canonicalWorkspace(context.workspace)
    let sidecar = this.sidecars.get(workspace)
    if (sidecar === undefined || !sidecar.running) {
      sidecar?.close()
      sidecar = this.start(workspace)
      this.sidecars.set(workspace, sidecar)
    }
    return sidecar.execute(input, context.signal)
  }

  async readiness(workspace: string): Promise<SidecarReadiness> {
    const canonical = await canonicalWorkspace(workspace)
    const sidecar = this.sidecars.get(canonical)
    return sidecar?.readiness() ?? {
      workspace: canonical,
      running: false,
      pendingRequests: 0,
      stderrTail: "",
    }
  }

  async closeWorkspace(workspace: string): Promise<void> {
    const canonical = await canonicalWorkspace(workspace)
    const sidecar = this.sidecars.get(canonical)
    this.sidecars.delete(canonical)
    sidecar?.close()
  }

  close(): void {
    for (const sidecar of this.sidecars.values()) sidecar.close()
    this.sidecars.clear()
  }

  private start(workspace: string): WorkspaceSidecar {
    const launch = typeof this.config.launch === "function"
      ? this.config.launch(workspace)
      : this.config.launch
    if (launch.command.trim().length === 0) {
      throw new NarrativeSidecarError("sidecar command must not be empty", "INVALID_CONFIG")
    }
    return new WorkspaceSidecar(
      workspace,
      launch,
      this.requestTimeoutMs,
      this.stderrLimitBytes,
    )
  }
}

class WorkspaceSidecar {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly pending = new Map<string, PendingRequest>()
  private stderrTail = ""
  private exited = false

  constructor(
    private readonly workspace: string,
    launch: SidecarLaunch,
    private readonly requestTimeoutMs: number,
    private readonly stderrLimitBytes: number,
  ) {
    try {
      this.child = spawn(launch.command, launch.args, {
        cwd: workspace,
        env: launch.env ?? process.env,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      })
    } catch (error) {
      throw new NarrativeSidecarError(
        `failed to start narrative sidecar: ${errorMessage(error)}`,
        "SPAWN_FAILED",
      )
    }

    this.child.once("error", (error) => {
      this.failAll(new NarrativeSidecarError(
        `narrative sidecar failed: ${error.message}`,
        "SPAWN_FAILED",
      ))
    })
    this.child.once("exit", (code, signal) => {
      this.exited = true
      this.failAll(new NarrativeSidecarError(
        `narrative sidecar exited (code=${String(code)}, signal=${String(signal)})${this.stderrSuffix()}`,
        "PROCESS_EXITED",
      ))
    })
    this.child.stderr.setEncoding("utf8")
    this.child.stderr.on("data", (chunk: string) => this.captureStderr(chunk))

    const lines = createInterface({ input: this.child.stdout, crlfDelay: Number.POSITIVE_INFINITY })
    lines.on("line", (line) => this.acceptLine(line))
  }

  get running(): boolean {
    return !this.exited && this.child.exitCode === null && !this.child.killed
  }

  execute(input: NarrativeToolInput, signal?: AbortSignal): Promise<NarrativeToolResult> {
    if (!this.running) {
      return Promise.reject(new NarrativeSidecarError(
        `narrative sidecar is not running${this.stderrSuffix()}`,
        "PROCESS_EXITED",
      ))
    }
    if (signal?.aborted === true) {
      return Promise.reject(new NarrativeSidecarError("narrative request was aborted", "REQUEST_ABORTED"))
    }

    const id = randomUUID()
    return new Promise<NarrativeToolResult>((resolveRequest, rejectRequest) => {
      const timer = setTimeout(() => {
        this.terminateForUncertainRequest(new NarrativeSidecarError(
          `narrative request timed out after ${this.requestTimeoutMs}ms`,
          "REQUEST_TIMEOUT",
        ))
      }, this.requestTimeoutMs)

      const pending: PendingRequest = {
        resolve: resolveRequest,
        reject: rejectRequest,
        timer,
      }
      if (signal !== undefined) {
        const abort = () => this.terminateForUncertainRequest(
          new NarrativeSidecarError("narrative request was aborted", "REQUEST_ABORTED"),
        )
        signal.addEventListener("abort", abort, { once: true })
        pending.removeAbort = () => signal.removeEventListener("abort", abort)
      }
      this.pending.set(id, pending)

      const request = { ...input, id }
      this.child.stdin.write(`${JSON.stringify(request)}\n`, (error) => {
        if (error === null || error === undefined) return
        this.terminateForUncertainRequest(new NarrativeSidecarError(
          `failed to write narrative request: ${error.message}`,
          "PROCESS_EXITED",
        ))
      })
    })
  }

  readiness(): SidecarReadiness {
    return {
      workspace: this.workspace,
      running: this.running,
      ...(this.child.pid === undefined ? {} : { pid: this.child.pid }),
      pendingRequests: this.pending.size,
      stderrTail: this.stderrTail,
    }
  }

  close(): void {
    if (this.running) this.child.kill("SIGTERM")
    this.exited = true
    this.failAll(new NarrativeSidecarError("narrative sidecar was closed", "PROCESS_EXITED"))
  }

  private acceptLine(line: string): void {
    let response: ServiceResponse
    try {
      response = JSON.parse(line) as ServiceResponse
    } catch {
      this.terminateForUncertainRequest(new NarrativeSidecarError(
        `narrative sidecar emitted invalid JSON${this.stderrSuffix()}`,
        "PROTOCOL_ERROR",
      ))
      return
    }
    if (typeof response.id !== "string") {
      this.terminateForUncertainRequest(new NarrativeSidecarError(
        "narrative sidecar response is missing an id",
        "PROTOCOL_ERROR",
      ))
      return
    }
    const pending = this.pending.get(response.id)
    if (pending === undefined) return
    this.pending.delete(response.id)
    finishPending(pending)
    if (!isNarrativeToolResult(response.result)) {
      pending.reject(new NarrativeSidecarError(
        "narrative sidecar response contains an invalid result",
        "PROTOCOL_ERROR",
      ))
      return
    }
    pending.resolve(response.result)
  }

  private captureStderr(chunk: string): void {
    this.stderrTail = `${this.stderrTail}${chunk}`
    while (Buffer.byteLength(this.stderrTail, "utf8") > this.stderrLimitBytes) {
      this.stderrTail = this.stderrTail.slice(Math.max(1, Math.floor(this.stderrTail.length / 8)))
    }
  }

  private terminateForUncertainRequest(error: NarrativeSidecarError): void {
    if (this.running) this.child.kill("SIGTERM")
    this.exited = true
    this.failAll(error)
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      finishPending(pending)
      pending.reject(error)
    }
    this.pending.clear()
  }

  private stderrSuffix(): string {
    const tail = this.stderrTail.trim()
    return tail.length === 0 ? "" : `; stderr: ${tail}`
  }
}

export function sidecarLaunchFromEnv(env: NodeJS.ProcessEnv = process.env): SidecarLaunch {
  const coreRoot = env.NOVELCODE_DSH_CORE_ROOT
  const explicitEntry = env.NOVELCODE_DSH_SERVICE_ENTRY
  if ((coreRoot === undefined || coreRoot.trim().length === 0)
    && (explicitEntry === undefined || explicitEntry.trim().length === 0)) {
    throw new NarrativeSidecarError(
      "set NOVELCODE_DSH_CORE_ROOT or NOVELCODE_DSH_SERVICE_ENTRY",
      "INVALID_CONFIG",
    )
  }
  const serviceEntry = explicitEntry?.trim().length
    ? resolve(explicitEntry)
    : resolve(
      coreRoot as string,
      "apps/novelcode/packages/narrative/src/service.ts",
    )
  return {
    command: env.NOVELCODE_DSH_BUN_EXECUTABLE?.trim() || "bun",
    args: [serviceEntry],
    env,
  }
}

async function canonicalWorkspace(workspace: string): Promise<string> {
  if (workspace.trim().length === 0) {
    throw new NarrativeSidecarError("workspace must not be empty", "INVALID_WORKSPACE")
  }
  try {
    return await realpath(resolve(workspace))
  } catch (error) {
    throw new NarrativeSidecarError(
      `workspace cannot be resolved: ${errorMessage(error)}`,
      "INVALID_WORKSPACE",
    )
  }
}

function isNarrativeToolResult(value: unknown): value is NarrativeToolResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const result = value as Partial<NarrativeToolResult>
  return typeof result.success === "boolean"
    && typeof result.summary === "string"
    && Array.isArray(result.artifacts)
    && result.artifacts.every((item) => typeof item === "string")
    && result.metrics !== null
    && typeof result.metrics === "object"
    && !Array.isArray(result.metrics)
    && Object.values(result.metrics).every((item) => typeof item === "number" && Number.isFinite(item))
}

function positiveInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new NarrativeSidecarError(`${name} must be a positive integer`, "INVALID_CONFIG")
  }
  return value
}

function finishPending(pending: PendingRequest): void {
  clearTimeout(pending.timer)
  pending.removeAbort?.()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
