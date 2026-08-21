import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { worldDeltaRef } from "@novelcode-dsh/blueprint-compiler"
import type { StoryEvent } from "@novelcode-dsh/memory-model"
import { baselineCanonHash } from "@novelcode-dsh/simulation"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  BRANCH_BLUEPRINT_ORCHESTRATION_SCHEMA,
  STATE_CANDIDATES_ORCHESTRATION_SCHEMA,
  compileWorkspaceBranchBlueprint,
  compileWorkspaceStateCandidates,
  loadConfirmedMemorySnapshot,
  resolveWorkspacePayload,
  type BranchBlueprintOrchestrationEnvelope,
} from "../src/index.js"

let workspace = ""
const cleanup: string[] = []
const baselineEvent: StoryEvent = {
  id: "baseline-map",
  eventType: "map_changed",
  lifecycle: "confirmed",
  storyTime: { sequence: 1 },
  narrativePosition: { chapterIndex: 1, order: 1 },
  validity: { fromSequence: 1 },
  participants: ["character-a"],
  causes: [],
  effects: [{ entityId: "map-a", fieldPath: "coastline", operation: "set", next: "divergent" }],
  evidence: [{ sourceId: "revision-1", revisionHash: "hash-1", locator: "chapter:001/lines:3-3" }],
  recordedAt: "2026-08-21T00:00:00Z",
}

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "novelcode-host-orchestration-"))
  cleanup.push(workspace)
  await writeConfirmedEvent(workspace, baselineEvent)
  await writeFile(join(workspace, ".narrative/brain/README.md"), "# Brain\n\nOperational documentation, not canon.\n", "utf8")
})

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe("trusted workspace orchestration", () => {
  it("builds the live baseline from confirmed Markdown Brain pages", async () => {
    const snapshot = await loadConfirmedMemorySnapshot(workspace)
    expect(snapshot.events).toEqual([baselineEvent])
    expect(snapshot.knowledge).toEqual([])
    expect(snapshot.baselineCanonHash).toBe(baselineCanonHash([baselineEvent], []))
    expect(snapshot.sourcePaths).toEqual([".narrative/brain/l1/events/baseline-map.md"])
  })

  it("reconstructs confirmed character knowledge and fails closed on malformed Memory OS canon", async () => {
    await writeConfirmedKnowledge(workspace)
    const snapshot = await loadConfirmedMemorySnapshot(workspace)
    expect(snapshot.knowledge).toEqual([expect.objectContaining({
      id: "knowledge-map",
      claimId: "map-changes",
      subjectId: "character-a",
      stance: "knows",
      lifecycle: "confirmed",
    })])

    const malformed = join(workspace, ".narrative/brain/l1/events/malformed.md")
    await writeFile(malformed, `---
id: "malformed"
lifecycle: "confirmed"
---

<!-- novelcode:data:begin -->
\`\`\`json
{"memory_os_schema":"story-event/v1"}
\`\`\`
<!-- novelcode:data:end -->
`, "utf8")
    await expect(loadConfirmedMemorySnapshot(workspace)).rejects.toThrow(/event_type/)
  })

  it("replays candidates against the live snapshot before compiling existing actions", async () => {
    const result = await compileWorkspaceBranchBlueprint(branchEnvelope(), workspace)
    expect(result.simulation.viable).toBe(true)
    expect(result.compilation.provenanceProposal.action).toBe("narrative_memory_propose")
    expect(result.compilation.blueprintProposal.action).toBe("narrative_blueprint_propose")
    expect(result.compilation.baselineCanonHash).toBe(baselineCanonHash([baselineEvent], []))
    expect(JSON.stringify(result)).not.toContain("author_confirmed")
  })

  it("rejects stale branches and caller-supplied confirmed baselines before proposal writes", async () => {
    const stale = branchEnvelope()
    stale.branch.baselineCanonHash = "stale"
    await expect(compileWorkspaceBranchBlueprint(stale, workspace)).rejects.toThrow(/non-viable: stale_baseline/)

    await expect(compileWorkspaceBranchBlueprint({
      ...branchEnvelope(),
      baselineEvents: [],
    }, workspace)).rejects.toThrow(/cannot accept caller-supplied confirmed baseline/)
  })

  it("resolves workspace-local envelopes and rejects path escape", async () => {
    const payloadPath = join(workspace, "branch.json")
    await writeFile(payloadPath, `${JSON.stringify(branchEnvelope())}\n`, "utf8")
    await expect(resolveWorkspacePayload({ payload_path: "branch.json" }, workspace)).resolves.toMatchObject({
      schema: BRANCH_BLUEPRINT_ORCHESTRATION_SCHEMA,
    })

    const outside = await mkdtemp(join(tmpdir(), "novelcode-outside-payload-"))
    cleanup.push(outside)
    await writeFile(join(outside, "payload.json"), "{}\n", "utf8")
    await expect(resolveWorkspacePayload({ payload_path: join(outside, "payload.json") }, workspace))
      .rejects.toThrow(/escapes the novel workspace/)
  })

  it("delegates approved revision evidence checks without accepting a workspace override", async () => {
    const text = "第1章 合成章\n\n角色封存了地图。\n"
    const hash = sha256(text)
    const revisionPath = ".narrative/exports/chapters/chapter-001/revision-a.txt"
    const manifestPath = ".narrative/drafts/run-a/manifest.json"
    await mkdir(join(workspace, revisionPath, ".."), { recursive: true })
    await mkdir(join(workspace, manifestPath, ".."), { recursive: true })
    await writeFile(join(workspace, revisionPath), text, "utf8")
    await writeFile(join(workspace, manifestPath), `${JSON.stringify({
      schema: "novelcode-writing-run-v2",
      status: "approved",
      chapter_index: 1,
      approved_export_path: revisionPath,
      approved_revision_id: "revision-a",
      approved_content_sha256: hash,
      segments: [{ segment_id: "segment-01" }],
    })}\n`, "utf8")
    const payload = {
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
          excerptSha256: sha256("角色封存了地图。"),
        },
        candidate: {
          id: "approved-event",
          eventType: "evidence_archived",
          storyTime: { sequence: 2 },
          narrativePosition: { chapterIndex: 1, segmentId: "segment-01", order: 2 },
          validity: { fromSequence: 2 },
          participants: ["character-a"],
          causes: ["baseline-map"],
          effects: [],
          recordedAt: "2026-08-21T00:00:00Z",
        },
      }],
    }
    await expect(compileWorkspaceStateCandidates(payload, workspace)).resolves.toMatchObject({
      revisionId: "revision-a",
      proposals: [{ action: "narrative_memory_propose" }],
    })
    await expect(compileWorkspaceStateCandidates({ ...payload, workspaceRoot: "/tmp/forged" }, workspace))
      .rejects.toThrow(/cannot override/)
  })
})

function branchEnvelope(): BranchBlueprintOrchestrationEnvelope {
  const delta = [{ entityId: "character-a", fieldPath: "location", operation: "set" as const, next: "archive" }]
  return {
    schema: BRANCH_BLUEPRINT_ORCHESTRATION_SCHEMA,
    branch: {
      id: "branch-a",
      baselineCanonHash: baselineCanonHash([baselineEvent], []),
      status: "sandbox",
      hypothesis: "角色进入档案馆。",
      candidateEventIds: ["candidate-a"],
      stateDelta: delta,
      costs: [],
      conflicts: [],
      foreshadowImpacts: [],
    },
    candidateEvents: [{
      id: "candidate-a",
      eventType: "location_changed",
      lifecycle: "candidate",
      storyTime: { sequence: 2 },
      narrativePosition: { chapterIndex: 2, segmentId: "segment-01", order: 2 },
      validity: { fromSequence: 2 },
      participants: ["character-a"],
      causes: ["baseline-map"],
      effects: delta,
      evidence: [{ sourceId: "branch-a", revisionHash: "hypothesis-v1", locator: "candidate-a" }],
      recordedAt: "2026-08-21T00:00:00Z",
    }],
    throughSequence: 2,
    chapter: {
      blueprintId: "chapter-002",
      title: "档案馆",
      chapterIndex: 2,
      chapterFunction: "让角色进入档案馆核对地图。",
      entryState: "角色在外部。",
      exitState: "角色抵达档案馆。",
      requiredChanges: ["角色进入档案馆"],
      forbiddenChanges: ["不揭示幕后者"],
      reveals: [],
      withheldInformation: ["幕后者身份"],
      relationshipPressure: [],
      trackerMoves: [],
      segments: [{
        segmentId: "segment-01",
        title: "进入档案馆",
        goal: "取得地图记录。",
        entryState: "角色在外部。",
        exitState: "角色进入档案馆。",
        requiredChanges: ["location 变为 archive"],
        forbiddenChanges: [],
        worldDeltaRefs: [worldDeltaRef(delta[0]!)],
        pov: "character-a",
        participants: ["character-a"],
        informationState: { readerKnows: ["地图变化"], povKnows: ["地图变化"], withheld: ["幕后者"] },
        intendedReaderEffects: ["curiosity"],
        representationNeeds: ["spatial_evidence"],
        targetChars: 100,
        minChars: 80,
      }],
    },
  }
}

async function writeConfirmedEvent(root: string, event: StoryEvent): Promise<void> {
  const target = join(root, ".narrative/brain/l1/events/baseline-map.md")
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
}

async function writeConfirmedKnowledge(root: string): Promise<void> {
  const target = join(root, ".narrative/brain/l3/memory/knowledge-map.md")
  await mkdir(join(target, ".."), { recursive: true })
  const evidence = [{ sourceId: "revision-1", revisionHash: "hash-1", locator: "chapter:001/lines:3-3" }]
  await writeFile(target, `---
id: "knowledge-map"
type: "narrative_memory"
layer: "L3_MEMORY"
lifecycle: "confirmed"
evidence: ${JSON.stringify(evidence.map((item) => `${item.sourceId}@${item.revisionHash}#${item.locator}`))}
---

<!-- novelcode:data:begin -->
\`\`\`json
${JSON.stringify({
    memory_os_schema: "knowledge-claim/v1",
    claim_id: "map-changes",
    subject_id: "character-a",
    stance: "knows",
    confidence: 1,
    acquired_at: { sequence: 1 },
    visibility_scope: ["character-a"],
    evidence_refs: evidence,
  }, null, 2)}
\`\`\`
<!-- novelcode:data:end -->
`, "utf8")
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}
