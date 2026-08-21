import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Context } from "@deepseek-ai/cordis"
import { CallId } from "@deepseek-ai/dsh-llm"
import SystemPrompt from "@deepseek-ai/dsh-system-prompt"
import ToolRuntime from "@deepseek-ai/dsh-tools"
import ApprovalService, { type ApprovalOutcome } from "@deepseek-ai/dsh-user-approval"
import { NOVELCODE_DSH_WORKSPACE_MARKER, NOVELCODE_DSH_WORKSPACE_SCHEMA } from "@novelcode-dsh/contracts"
import {
  BRANCH_BLUEPRINT_ORCHESTRATION_SCHEMA,
  STATE_CANDIDATES_ORCHESTRATION_SCHEMA,
  loadConfirmedMemorySnapshot,
  type BranchBlueprintOrchestrationEnvelope,
} from "@novelcode-dsh/host-orchestration"
import { describe, expect, it } from "vitest"
import NovelService, { NOVEL_SYSTEM_PROMPT } from "../src/index.js"

describe("NovelCode DSH plugin registration", () => {
  it("registers ctx.novel, exactly five tools, and the research-aware prompt", async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(NovelService, {
      bunExecutable: process.execPath,
      serviceEntry: join(import.meta.dirname, "../../jsonl-provider/tests/fixtures/mock-service.mjs"),
      requestTimeoutMs: 2_000,
      stderrLimitBytes: 2_000,
      approvalTtlMs: 2_000,
    })

    expect(ctx.novel).toBeInstanceOf(NovelService)
    expect(ctx.tools.schemas().map((tool) => tool.name).sort()).toEqual([
      "narrative_memory",
      "narrative_plan",
      "narrative_project",
      "narrative_source",
      "narrative_writing",
    ])
    const prompt = await ctx.systemPrompt.assemble()
    expect(prompt.sections.map((section) => section.text).join("\n")).toContain(NOVEL_SYSTEM_PROMPT)
  })

  it("executes a low-risk tool through the DSH pipeline and workspace sidecar", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "novelcode-dsh-plugin-"))
    await markWorkspace(workspace)
    const ctx = await mount()
    const events: Array<{ type: string; data: unknown }> = []
    try {
      const result = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: CallId("project-status"),
        name: "narrative_project",
        arguments: { action: "narrative_project_status" },
        agent: {
          id: "session-plugin",
          session: {
            header: { cwd: workspace },
            append(type: string, data: unknown) {
              events.push({ type, data })
            },
          },
        } as never,
      })
      expect(result.isError).toBe(false)
      expect(events.map((event) => event.type)).toEqual(["novel/project-bound"])
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it("denies an author-controlled transition when no approval service is mounted", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "novelcode-dsh-approval-"))
    await markWorkspace(workspace)
    const ctx = await mount()
    try {
      const result = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: CallId("memory-confirm"),
        name: "narrative_memory",
        arguments: {
          action: "narrative_memory_confirm",
          payload: { proposal_id: "proposal-1", confirmation: "author_confirmed" },
        },
        agent: {
          id: "session-approval",
          session: { header: { cwd: workspace }, append() {} },
        } as never,
      })
      expect(result.isError).toBe(true)
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it("denies novel tools in an unrelated workspace before starting a sidecar", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "novelcode-dsh-unbound-"))
    const ctx = await mount()
    try {
      const result = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: CallId("unbound-status"),
        name: "narrative_project",
        arguments: { action: "narrative_project_status" },
        agent: {
          id: "session-unbound",
          session: { header: { cwd: workspace }, append() {} },
        } as never,
      })
      expect(result.isError).toBe(true)
      expect(result.content).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "text", text: expect.stringContaining("not bound to NovelCode DSH") }),
      ]))
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it("executes an exact high-risk call only after DSH allowed-once approval", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "novelcode-dsh-approved-"))
    await markWorkspace(workspace)
    const ctx = await mount(true)
    const session = openSession(workspace)
    const agent = { id: "session-approved", session } as never
    const execution = {
      signal: new AbortController().signal,
      callId: CallId("memory-confirm-approved"),
      name: "narrative_memory",
      arguments: {
        action: "narrative_memory_confirm",
        payload: { proposal_id: "proposal-approved", confirmation: "forged-by-model" },
      },
      agent,
    } as const
    ctx.on("approval/request", () => Promise.resolve<ApprovalOutcome>("allowed-once"))
    try {
      const result = await ctx.tools.execute(execution)
      expect(result.isError).toBe(false)
      expect(result.value).toMatchObject({
        payload: {
          proposal_id: "proposal-approved",
          confirmation: "author_confirmed",
        },
      })
      expect(session.events.map((event) => event.type)).toEqual([
        "turn/start",
        "approval/asked",
        "approval/decided",
        "novel/memory-transition",
        "novel/author-approved",
      ])
      expect(session.events[2]).toMatchObject({ data: { outcome: "allowed-once" } })

      await expect(ctx.novel.execute(
        "narrative_memory",
        execution.arguments,
        { ...execution, name: "narrative_memory" } as never,
      )).rejects.toThrow(/exact, unexpired author approval capability/)
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it("does not execute a high-risk call rejected by the DSH approval service", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "novelcode-dsh-rejected-"))
    await markWorkspace(workspace)
    const ctx = await mount(true)
    const session = openSession(workspace)
    ctx.on("approval/request", () => Promise.resolve<ApprovalOutcome>("rejected"))
    try {
      const result = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: CallId("memory-confirm-rejected"),
        name: "narrative_memory",
        arguments: { action: "narrative_memory_confirm", payload: { proposal_id: "proposal-rejected" } },
        agent: { id: "session-rejected", session } as never,
      })
      expect(result.isError).toBe(true)
      expect(result.content).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "text", text: expect.stringContaining("user rejected") }),
      ]))
      expect(session.events.map((event) => event.type)).toEqual([
        "turn/start",
        "approval/asked",
        "approval/decided",
      ])
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it("compiles a branch envelope through the existing narrative_plan tool", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "novelcode-dsh-branch-orchestration-"))
    await markWorkspace(workspace)
    const baseline = await writeConfirmedEvent(workspace)
    const baselineHash = (await loadConfirmedMemorySnapshot(workspace)).baselineCanonHash
    const ctx = await mount()
    const session = openSession(workspace)
    try {
      const result = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: CallId("branch-orchestration"),
        name: "narrative_plan",
        arguments: { action: "narrative_blueprint_propose", payload: branchEnvelope(baseline, baselineHash) },
        agent: { id: "session-branch", session } as never,
      })
      expect(result.isError).toBe(false)
      expect(result.value).toMatchObject({
        success: true,
        metrics: { orchestration_proposals: 2 },
        payload: {
          orchestration_schema: BRANCH_BLUEPRINT_ORCHESTRATION_SCHEMA,
          branch_provenance_proposal_id: "branch-proposal-branch-runtime",
          blueprint_proposal_id: "chapter-002",
          promotion_boundary: "proposal_only",
        },
      })
      expect(session.events.map((event) => event.type)).toEqual(["turn/start", "novel/blueprint-transition"])
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it("rejects a stale branch envelope before writing either proposal", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "novelcode-dsh-stale-branch-"))
    await markWorkspace(workspace)
    const baseline = await writeConfirmedEvent(workspace)
    const baselineHash = (await loadConfirmedMemorySnapshot(workspace)).baselineCanonHash
    const envelope = branchEnvelope(baseline, baselineHash)
    envelope.branch.baselineCanonHash = "stale"
    const ctx = await mount()
    try {
      const result = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: CallId("stale-branch-orchestration"),
        name: "narrative_plan",
        arguments: { action: "narrative_blueprint_propose", payload: envelope },
        agent: { id: "session-stale", session: openSession(workspace) } as never,
      })
      expect(result.isError).toBe(true)
      expect(result.content).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "text", text: expect.stringContaining("stale_baseline") }),
      ]))
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it("compiles approved revision candidates through the existing narrative_memory tool", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "novelcode-dsh-state-orchestration-"))
    await markWorkspace(workspace)
    const text = "第1章 合成章\n\n顾岚封存了地图。\n"
    const hash = sha256(text)
    const revisionPath = ".narrative/exports/chapters/chapter-001/revision-runtime.txt"
    const manifestPath = ".narrative/drafts/run-runtime/manifest.json"
    await mkdir(join(workspace, revisionPath, ".."), { recursive: true })
    await mkdir(join(workspace, manifestPath, ".."), { recursive: true })
    await writeFile(join(workspace, revisionPath), text, "utf8")
    await writeFile(join(workspace, manifestPath), `${JSON.stringify({
      schema: "novelcode-writing-run-v2",
      status: "approved",
      chapter_index: 1,
      approved_export_path: revisionPath,
      approved_revision_id: "revision-runtime",
      approved_content_sha256: hash,
      segments: [{ segment_id: "segment-01" }],
    })}\n`, "utf8")
    const ctx = await mount()
    try {
      const result = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: CallId("state-orchestration"),
        name: "narrative_memory",
        arguments: {
          action: "narrative_memory_propose",
          payload: {
            schema: STATE_CANDIDATES_ORCHESTRATION_SCHEMA,
            manifestPath,
            approvedRevisionPath: revisionPath,
            approvedContentSha256: hash,
            throughStorySequence: 2,
            storyEvents: [{
              locator: {
                chapterIndex: 1,
                segmentId: "segment-01",
                startLine: 3,
                endLine: 3,
                excerptSha256: sha256("顾岚封存了地图。"),
              },
              candidate: {
                id: "event-runtime-seal",
                eventType: "evidence_archived",
                storyTime: { sequence: 2 },
                narrativePosition: { chapterIndex: 1, segmentId: "segment-01", order: 2 },
                validity: { fromSequence: 2 },
                participants: ["顾岚"],
                causes: [],
                effects: [],
                recordedAt: "2026-08-21T00:00:00Z",
              },
            }],
          },
        },
        agent: { id: "session-state", session: openSession(workspace) } as never,
      })
      expect(result.isError).toBe(false)
      expect(result.value).toMatchObject({
        success: true,
        payload: {
          orchestration_schema: STATE_CANDIDATES_ORCHESTRATION_SCHEMA,
          revision_hash: hash,
          proposal_ids: ["event-runtime-seal"],
          promotion_boundary: "proposal_only",
        },
      })
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })
})

async function mount(withApproval = false): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  if (withApproval) await ctx.plugin(ApprovalService)
  await ctx.plugin(NovelService, {
    bunExecutable: process.execPath,
    serviceEntry: join(import.meta.dirname, "../../jsonl-provider/tests/fixtures/mock-service.mjs"),
    requestTimeoutMs: 2_000,
    stderrLimitBytes: 2_000,
    approvalTtlMs: 2_000,
  })
  return ctx
}

function openSession(workspace: string) {
  const events: Array<{ type: string; data?: unknown }> = [{ type: "turn/start" }]
  return {
    header: { cwd: workspace },
    events,
    append(type: string, data: unknown) {
      events.push({ type, data })
      return events.at(-1)
    },
  }
}

async function markWorkspace(workspace: string): Promise<void> {
  const target = join(workspace, NOVELCODE_DSH_WORKSPACE_MARKER)
  await mkdir(join(target, ".."), { recursive: true })
  await writeFile(target, `${JSON.stringify({
    schema: NOVELCODE_DSH_WORKSPACE_SCHEMA,
    product: "novelcode-dsh",
    scope: "single-novel",
  })}\n`, "utf8")
}

async function writeConfirmedEvent(workspace: string) {
  const event = {
    id: "runtime-baseline-map",
    eventType: "map_changed",
    lifecycle: "confirmed",
    storyTime: { sequence: 1 },
    narrativePosition: { chapterIndex: 1, order: 1 },
    validity: { fromSequence: 1 },
    participants: ["顾岚"],
    causes: [],
    effects: [{ entityId: "map-a", fieldPath: "coastline", operation: "set", next: "divergent" }],
    evidence: [{ sourceId: "revision-1", revisionHash: "hash-1", locator: "chapter:001/lines:3-3" }],
    recordedAt: "2026-08-21T00:00:00Z",
  }
  const target = join(workspace, ".narrative/brain/l1/events/runtime-baseline-map.md")
  await mkdir(join(target, ".."), { recursive: true })
  await writeFile(target, `---
id: ${JSON.stringify(event.id)}
type: "canon_event"
layer: "L1"
lifecycle: "confirmed"
evidence: ${JSON.stringify(event.evidence.map((item) => `${item.sourceId}@${item.revisionHash}#${item.locator}`))}
---

# Synthetic confirmed event

<!-- novelcode:data:begin -->
\`\`\`json
${JSON.stringify({
    memory_os_schema: "story-event/v1",
    event_type: event.eventType,
    story_time: event.storyTime,
    narrative_position: event.narrativePosition,
    validity: event.validity,
    participants: event.participants,
    causes: event.causes,
    effects: event.effects,
    evidence_refs: event.evidence,
    recorded_at: event.recordedAt,
  }, null, 2)}
\`\`\`
<!-- novelcode:data:end -->
`, "utf8")
  return event
}

function branchEnvelope(baseline: { id: string }, baselineHash: string): BranchBlueprintOrchestrationEnvelope {
  const delta = [{ entityId: "character-gulan", fieldPath: "location", operation: "set" as const, next: "archive" }]
  return {
    schema: BRANCH_BLUEPRINT_ORCHESTRATION_SCHEMA,
    branch: {
      id: "branch-runtime",
      baselineCanonHash: baselineHash,
      status: "sandbox",
      hypothesis: "顾岚进入档案馆。",
      candidateEventIds: ["candidate-runtime"],
      stateDelta: delta,
      costs: [],
      conflicts: [],
      foreshadowImpacts: [],
    },
    candidateEvents: [{
      id: "candidate-runtime",
      eventType: "location_changed",
      lifecycle: "candidate",
      storyTime: { sequence: 2 },
      narrativePosition: { chapterIndex: 2, segmentId: "segment-01", order: 2 },
      validity: { fromSequence: 2 },
      participants: ["顾岚"],
      causes: [baseline.id],
      effects: delta,
      evidence: [{ sourceId: "branch-runtime", revisionHash: "hypothesis-v1", locator: "candidate-runtime" }],
      recordedAt: "2026-08-21T00:00:00Z",
    }],
    throughSequence: 2,
    chapter: {
      blueprintId: "chapter-002",
      title: "档案馆",
      chapterIndex: 2,
      chapterFunction: "让顾岚进入档案馆。",
      entryState: "顾岚在外部。",
      exitState: "顾岚抵达档案馆。",
      requiredChanges: ["顾岚进入档案馆"],
      forbiddenChanges: ["不揭示幕后者"],
      reveals: [],
      withheldInformation: ["幕后者身份"],
      relationshipPressure: [],
      trackerMoves: [],
      segments: [{
        segmentId: "segment-01",
        title: "进入档案馆",
        goal: "取得地图记录。",
        entryState: "顾岚在外部。",
        exitState: "顾岚进入档案馆。",
        requiredChanges: ["location 变为 archive"],
        forbiddenChanges: [],
        worldDeltaRefs: [`${delta[0]!.entityId}:${delta[0]!.fieldPath}`],
        pov: "顾岚",
        participants: ["顾岚"],
        informationState: { readerKnows: ["地图变化"], povKnows: ["地图变化"], withheld: ["幕后者"] },
        intendedReaderEffects: ["curiosity"],
        representationNeeds: ["spatial_evidence"],
        targetChars: 100,
        minChars: 80,
      }],
    },
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}
