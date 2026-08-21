import { access, readFile, realpath } from "node:fs/promises"
import { join } from "node:path"
import type { Context } from "@deepseek-ai/cordis"
import { Service } from "@deepseek-ai/cordis"
import z from "@deepseek-ai/schemastery"
import { defineTool, type PreToolDecision, type ToolExecution } from "@deepseek-ai/dsh-tools"
import type {} from "@deepseek-ai/dsh-session"
import type {} from "@deepseek-ai/dsh-system-prompt"
import {
  NARRATIVE_MEMORY_ACTIONS,
  NARRATIVE_PLAN_ACTIONS,
  NARRATIVE_PROJECT_ACTIONS,
  NARRATIVE_SOURCE_ACTIONS,
  NARRATIVE_WRITING_ACTIONS,
  NOVELCODE_DSH_WORKSPACE_MARKER,
  NOVELCODE_V2_PROJECT_MANIFEST,
  actionBelongsToTool,
  isNovelCodeDshWorkspaceMarker,
  isHighRiskNarrativeAction,
  isNarrativeV2Action,
  type JsonValue,
  type NarrativeToolInput,
  type NarrativeToolName,
  type NarrativeToolResult,
  type NarrativeV2Action,
} from "@novelcode-dsh/contracts"
import {
  JsonlSidecarProvider,
  sidecarLaunchFromEnv,
  type SidecarReadiness,
} from "@novelcode-dsh/jsonl-provider"
import {
  BRANCH_BLUEPRINT_ORCHESTRATION_SCHEMA,
  STATE_CANDIDATES_ORCHESTRATION_SCHEMA,
  compileWorkspaceBranchBlueprint,
  compileWorkspaceStateCandidates,
  loadConfirmedMemorySnapshot,
  orchestrationSchema,
  resolveWorkspacePayload,
} from "@novelcode-dsh/host-orchestration"
import { AuthorCapabilityStore } from "./author-capability.js"
import { eventForAction, operationalEventData } from "./events.js"
import { NOVEL_SYSTEM_PROMPT } from "./prompt.js"
import { WorkspaceOperationQueue } from "./workspace-queue.js"

export * from "./author-capability.js"
export * from "./events.js"
export * from "./workspace-queue.js"
export { NOVEL_SYSTEM_PROMPT } from "./prompt.js"

export interface Config {
  coreRoot?: string
  serviceEntry?: string
  bunExecutable?: string
  requestTimeoutMs?: number
  stderrLimitBytes?: number
  approvalTtlMs?: number
}

export const Config: z<Config> = z.object({
  coreRoot: z.string(),
  serviceEntry: z.string(),
  bunExecutable: z.string(),
  requestTimeoutMs: z.number().default(120_000),
  stderrLimitBytes: z.number().default(16_384),
  approvalTtlMs: z.number().default(300_000),
})

declare module "@deepseek-ai/cordis" {
  interface Context {
    novel: NovelService
  }
}

export class NovelService extends Service {
  static inject = ["tools", "systemPrompt"]
  static Config = Config

  private readonly provider: JsonlSidecarProvider
  private readonly capabilities: AuthorCapabilityStore
  private readonly workspaceQueue = new WorkspaceOperationQueue()

  constructor(ctx: Context, config: Config) {
    super(ctx, "novel")
    const env = resolvedEnvironment(config)
    this.provider = new JsonlSidecarProvider({
      launch: sidecarLaunchFromEnv(env),
      ...(config.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: config.requestTimeoutMs }),
      ...(config.stderrLimitBytes === undefined ? {} : { stderrLimitBytes: config.stderrLimitBytes }),
    })
    this.capabilities = new AuthorCapabilityStore(config.approvalTtlMs)

    ctx.systemPrompt.section({
      name: "novelcode:author-studio",
      order: 200,
      text: NOVEL_SYSTEM_PROMPT,
    })
    registerTools(ctx, this)
    registerAuthorGate(ctx, this.capabilities)
    ctx.effect(() => () => this.provider.close())
  }

  async execute(
    tool: NarrativeToolName,
    rawInput: Record<string, unknown>,
    execution: ToolExecution,
  ): Promise<NarrativeToolResult> {
    const action = rawInput.action
    if (!isNarrativeV2Action(action) || !actionBelongsToTool(tool, action)) {
      throw new Error(`${String(action)} is not valid for ${tool}`)
    }
    const workspace = execution.agent?.session.header.cwd
    if (workspace === undefined) {
      throw new Error(`${tool} requires a DSH session with an immutable workspace cwd`)
    }

    const canonicalWorkspace = await realpath(workspace)
    const run = async (): Promise<NarrativeToolResult> => this.executeInWorkspace(
      action,
      rawInput,
      canonicalWorkspace,
      execution,
    )
    const result = actionRequiresWorkspaceSerialization(action)
      ? await this.workspaceQueue.run(canonicalWorkspace, execution.signal, run)
      : await run()
    const eventType = eventForAction(action)
    if (eventType !== undefined && execution.agent !== undefined) {
      execution.agent.session.append(eventType, operationalEventData(action, result))
      if (isHighRiskNarrativeAction(action) && result.success) {
        execution.agent.session.append(
          "novel/author-approved",
          operationalEventData(action, result),
        )
      }
    }
    return result
  }

  private async executeInWorkspace(
    action: NarrativeV2Action,
    rawInput: Record<string, unknown>,
    workspace: string,
    execution: ToolExecution,
  ): Promise<NarrativeToolResult> {
    const input = buildInput(rawInput, action, execution.agent?.id)
    if (isHighRiskNarrativeAction(action)) {
      const approved = this.capabilities.consume({
        callId: String(execution.callId),
        ...(execution.agent === undefined ? {} : { sessionId: String(execution.agent.id) }),
        action,
        arguments: rawInput,
      })
      if (!approved) {
        throw new Error(`${action} requires an exact, unexpired author approval capability`)
      }
      input.payload = {
        ...(input.payload ?? {}),
        confirmation: "author_confirmed",
      }
    }

    if (action === "narrative_blueprint_propose" || action === "narrative_memory_propose") {
      const payload = await resolveWorkspacePayload(input, workspace)
      const schema = orchestrationSchema(payload)
      if (schema === BRANCH_BLUEPRINT_ORCHESTRATION_SCHEMA) {
        if (action !== "narrative_blueprint_propose") throw new Error(`${schema} requires narrative_blueprint_propose`)
        return await this.executeBranchBlueprintOrchestration(payload, input.session_id, workspace, execution.signal)
      }
      if (schema === STATE_CANDIDATES_ORCHESTRATION_SCHEMA) {
        if (action !== "narrative_memory_propose") throw new Error(`${schema} requires narrative_memory_propose`)
        return await this.executeStateCandidateOrchestration(payload, input.session_id, workspace, execution.signal)
      }
      if (schema?.startsWith("novelcode-") && schema.includes("orchestration")) {
        throw new Error(`unsupported NovelCode orchestration schema: ${schema}`)
      }
    }

    let result = await this.provider.execute(input, {
      workspace,
      signal: execution.signal,
    })
    if (action === "narrative_memory_consistency_check" && result.success) {
      const snapshot = await loadConfirmedMemorySnapshot(workspace)
      result = {
        ...result,
        metrics: {
          ...result.metrics,
          memory_os_events: snapshot.events.length,
          memory_os_knowledge_claims: snapshot.knowledge.length,
        },
        payload: {
          ...resultPayload(result),
          memory_os_snapshot: {
            baseline_canon_hash: snapshot.baselineCanonHash,
            confirmed_events: snapshot.events.length,
            confirmed_knowledge_claims: snapshot.knowledge.length,
            source_pages: snapshot.sourcePaths.length,
          },
        },
      }
    }
    return result
  }

  private async executeBranchBlueprintOrchestration(
    payload: Record<string, unknown>,
    sessionId: string | undefined,
    workspace: string,
    signal: AbortSignal,
  ): Promise<NarrativeToolResult> {
    const prepared = await compileWorkspaceBranchBlueprint(payload, workspace)
    const provenance = await this.provider.execute(
      withSession(prepared.compilation.provenanceProposal, sessionId),
      { workspace, signal },
    )
    const provenanceId = proposalId(provenance, `branch-proposal-${prepared.compilation.sourceBranchId}`)
    if (!provenance.success) {
      return orchestrationFailure(provenance, {
        schema: BRANCH_BLUEPRINT_ORCHESTRATION_SCHEMA,
        stage: "branch_provenance",
        completedProposalIds: [],
      })
    }
    const blueprint = await this.provider.execute(
      withSession(prepared.compilation.blueprintProposal, sessionId),
      { workspace, signal },
    )
    const blueprintId = proposalId(blueprint, prepared.compilation.blueprintId)
    if (!blueprint.success) {
      return orchestrationFailure(blueprint, {
        schema: BRANCH_BLUEPRINT_ORCHESTRATION_SCHEMA,
        stage: "blueprint",
        completedProposalIds: [provenanceId],
        additionalArtifacts: provenance.artifacts,
      })
    }
    return {
      success: true,
      summary: `可行分支 ${prepared.compilation.sourceBranchId} 已编译为 provenance 与 Blueprint candidates；均尚未确认。`,
      artifacts: uniqueStrings([...provenance.artifacts, ...blueprint.artifacts]),
      metrics: {
        ...blueprint.metrics,
        orchestration_proposals: 2,
        branch_score: prepared.simulation.metrics.score,
        baseline_events: prepared.snapshot.events.length,
        baseline_knowledge_claims: prepared.snapshot.knowledge.length,
      },
      payload: {
        orchestration_schema: BRANCH_BLUEPRINT_ORCHESTRATION_SCHEMA,
        source_branch_id: prepared.compilation.sourceBranchId,
        baseline_canon_hash: prepared.snapshot.baselineCanonHash,
        branch_provenance_proposal_id: provenanceId,
        blueprint_proposal_id: blueprintId,
        blueprint_id: prepared.compilation.blueprintId,
        promotion_boundary: "proposal_only",
      },
      next: ["分别审查 branch provenance 与 Blueprint；提交 review 后，Blueprint confirm 仍需 DSH 原生作者审批。"],
    }
  }

  private async executeStateCandidateOrchestration(
    payload: Record<string, unknown>,
    sessionId: string | undefined,
    workspace: string,
    signal: AbortSignal,
  ): Promise<NarrativeToolResult> {
    const compilation = await compileWorkspaceStateCandidates(payload, workspace)
    const completed: string[] = []
    const artifacts: string[] = []
    for (const proposal of compilation.proposals) {
      const result = await this.provider.execute(withSession(proposal, sessionId), { workspace, signal })
      artifacts.push(...result.artifacts)
      if (!result.success) {
        return orchestrationFailure(result, {
          schema: STATE_CANDIDATES_ORCHESTRATION_SCHEMA,
          stage: "state_candidate_proposal",
          completedProposalIds: completed,
          additionalArtifacts: artifacts,
        })
      }
      completed.push(proposalId(result, proposal.payload.id))
    }
    return {
      success: true,
      summary: `批准 revision ${compilation.revisionId} 已生成 ${completed.length} 个 evidence-bound state candidates；尚未确认。`,
      artifacts: uniqueStrings(artifacts),
      metrics: { orchestration_proposals: completed.length, chapter_index: compilation.chapterIndex },
      payload: {
        orchestration_schema: STATE_CANDIDATES_ORCHESTRATION_SCHEMA,
        revision_id: compilation.revisionId,
        revision_path: compilation.revisionPath,
        revision_hash: compilation.revisionHash,
        proposal_ids: completed,
        promotion_boundary: "proposal_only",
      },
      next: ["逐项或批量提交 review；所有状态对象都必须继续经过现有 author-confirmation lifecycle。"],
    }
  }

  readiness(workspace: string): Promise<SidecarReadiness> {
    return this.provider.readiness(workspace)
  }
}

export default NovelService

function registerAuthorGate(ctx: Context, capabilities: AuthorCapabilityStore): void {
  ctx.on("tools/pre-execute", async (execution, next): Promise<PreToolDecision> => {
    if (!isNovelTool(execution.name)) return next()
    const workspace = execution.agent?.session.header.cwd
    if (workspace === undefined) {
      return { kind: "deny", reason: `${execution.name} requires a DSH session workspace` }
    }
    if (!await isNovelWorkspace(workspace)) {
      return {
        kind: "deny",
        reason: `workspace is not bound to NovelCode DSH; run \"noveldsh workspace init\" or select an existing NovelCode V2 workspace`,
      }
    }
    const action = readAction(execution.arguments)
    if (action === undefined || !actionBelongsToTool(execution.name, action)) {
      return { kind: "deny", reason: `invalid action for ${execution.name}` }
    }
    const downstream = await next()
    if (downstream.kind === "deny") return downstream
    if (!isHighRiskNarrativeAction(action)) return downstream
    capabilities.prepare({
      callId: String(execution.callId),
      ...(execution.agent === undefined ? {} : { sessionId: String(execution.agent.id) }),
      action,
      arguments: execution.arguments,
    })
    return {
      kind: "ask",
      reason: `${action} changes author-controlled novel state. Review the exact proposal, artifact paths, and hashes before approval.`,
    }
  })
}

export async function isNovelWorkspace(workspace: string): Promise<boolean> {
  if (await pathExists(join(workspace, NOVELCODE_V2_PROJECT_MANIFEST))) return true
  try {
    const marker = JSON.parse(await readFile(join(workspace, NOVELCODE_DSH_WORKSPACE_MARKER), "utf8")) as unknown
    return isNovelCodeDshWorkspaceMarker(marker)
  } catch {
    return false
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function registerTools(ctx: Context, novel: NovelService): void {
  registerTool(ctx, novel, "narrative_project", NARRATIVE_PROJECT_ACTIONS,
    "Initialize, inspect, and diagnose one NovelCode V2 workspace. One workspace is exactly one writable novel.")
  registerTool(ctx, novel, "narrative_source", NARRATIVE_SOURCE_ACTIONS,
    "Analyze source evidence and read-only novel references without silently changing canon.")
  registerTool(ctx, novel, "narrative_memory", NARRATIVE_MEMORY_ACTIONS,
    "Operate the Markdown Brain, GBrain derived index, confirmed retrieval, knowledge graph, style research, and explicit memory lifecycle.")
  registerTool(ctx, novel, "narrative_plan", NARRATIVE_PLAN_ACTIONS,
    "Propose or author-confirm chapter blueprints with state, information, causal, scene, and segment constraints.")
  registerTool(ctx, novel, "narrative_writing", NARRATIVE_WRITING_ACTIONS,
    "Compile writing packets, record file-backed segments, evaluate style and continuity, learn from revisions, approve immutable chapters, and export final text.")
}

function registerTool(
  ctx: Context,
  novel: NovelService,
  tool: NarrativeToolName,
  actions: readonly NarrativeV2Action[],
  description: string,
): void {
  ctx.tools.register(defineTool({
    name: tool,
    description,
    parameters: {
      action: {
        type: "string",
        required: true,
        enum: [...actions],
        description: "One action owned by this narrow NovelCode V2 tool surface.",
      },
      project_id: { type: "string" },
      project_title: { type: "string" },
      language: { type: "string" },
      embedding_model: { type: "string" },
      embedding_dimensions: { type: "number" },
      source_paths: { type: "array", items: { type: "string" } },
      query: { type: "string" },
      feedback: { type: "string" },
      payload_path: {
        type: "string",
        description: "Workspace-local JSON object merged into payload. Prefer it for large action input and versioned NovelCode orchestration envelopes.",
      },
      payload: {
        type: "json",
        description: "Action-specific JSON or a supported NovelCode orchestration envelope. Never put long prose here; use workspace files.",
      },
    },
    output: {
      schema: { type: "json" },
      render: (_args, value) => [{ type: "text", text: renderResult(value) }],
    },
    timeoutMs: 180_000,
    isConcurrencySafe: (args) => {
      const action = readAction(args)
      return action === "narrative_project_status"
        || action === "narrative_project_doctor"
        || action === "narrative_source_status"
        || action === "narrative_memory_search"
        || action === "narrative_memory_graph"
        || action === "narrative_memory_review"
    },
    async execute(args, execution) {
      return await novel.execute(tool, args, execution) as unknown as JsonValue
    },
  }))
}

function buildInput(
  rawInput: Record<string, unknown>,
  action: NarrativeV2Action,
  sessionId?: string,
): NarrativeToolInput {
  const input = { ...rawInput, action } as NarrativeToolInput
  delete input.cwd
  if (sessionId !== undefined) input.session_id = String(sessionId)
  if (input.payload !== undefined) {
    const { confirmation: _ignored, ...payload } = input.payload
    input.payload = payload
  }
  return input
}

function withSession(input: NarrativeToolInput, sessionId: string | undefined): NarrativeToolInput {
  return sessionId === undefined ? input : { ...input, session_id: sessionId }
}

function resultPayload(result: NarrativeToolResult): Record<string, JsonValue> {
  return result.payload !== null && typeof result.payload === "object" && !Array.isArray(result.payload)
    ? result.payload
    : {}
}

function proposalId(result: NarrativeToolResult, fallback: string): string {
  const value = resultPayload(result).proposal_id
  return typeof value === "string" && value.length > 0 ? value : fallback
}

function orchestrationFailure(
  result: NarrativeToolResult,
  context: {
    schema: string
    stage: string
    completedProposalIds: string[]
    additionalArtifacts?: string[]
  },
): NarrativeToolResult {
  return {
    ...result,
    success: false,
    summary: `${context.schema} failed at ${context.stage}: ${result.summary}`,
    artifacts: uniqueStrings([...(context.additionalArtifacts ?? []), ...result.artifacts]),
    metrics: { ...result.metrics, orchestration_completed_proposals: context.completedProposalIds.length },
    payload: {
      orchestration_schema: context.schema,
      failed_stage: context.stage,
      completed_proposal_ids: context.completedProposalIds,
      promotion_boundary: "proposal_only",
    },
    next: ["已完成的 proposal 保持 candidate；修正失败原因后使用新 ID 重试，禁止把部分结果视为 canon。"],
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function actionRequiresWorkspaceSerialization(action: NarrativeV2Action): boolean {
  return action !== "narrative_project_status"
    && action !== "narrative_source_status"
    && action !== "narrative_memory_search"
    && action !== "narrative_memory_graph"
    && action !== "narrative_memory_review"
}

function readAction(argumentsValue: unknown): NarrativeV2Action | undefined {
  if (argumentsValue === null || typeof argumentsValue !== "object" || Array.isArray(argumentsValue)) return undefined
  const action = (argumentsValue as Record<string, unknown>).action
  return isNarrativeV2Action(action) ? action : undefined
}

function isNovelTool(value: string): value is NarrativeToolName {
  return value === "narrative_project"
    || value === "narrative_source"
    || value === "narrative_memory"
    || value === "narrative_plan"
    || value === "narrative_writing"
}

function renderResult(value: JsonValue): string {
  return JSON.stringify(value, null, 2)
}

function resolvedEnvironment(config: Config): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(config.coreRoot === undefined ? {} : { NOVELCODE_DSH_CORE_ROOT: config.coreRoot }),
    ...(config.serviceEntry === undefined ? {} : { NOVELCODE_DSH_SERVICE_ENTRY: config.serviceEntry }),
    ...(config.bunExecutable === undefined ? {} : { NOVELCODE_DSH_BUN_EXECUTABLE: config.bunExecutable }),
  }
}
