import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { readNovelWorkbenchSnapshot } from "../src/snapshot.js"

const workspaces: string[] = []

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })))
})

describe("NovelCode read-only workbench snapshot", () => {
  it("projects V2 status, temporal memory, knowledge, writing and revisions without manuscript bodies", async () => {
    const workspace = await fixtureWorkspace()
    const snapshot = await readNovelWorkbenchSnapshot(workspace)

    expect(snapshot.project).toMatchObject({ status: "ready", projectId: "synthetic-web", title: "合成工作台" })
    expect(snapshot.sources).toMatchObject({ registered: 1, active: 1, files: 1, analysisRevisions: 1 })
    expect(snapshot.memory.status).toBe("ready")
    expect(snapshot.memory.events).toEqual([expect.objectContaining({ id: "event-door", sequence: 2 })])
    expect(snapshot.memory.knowledge).toEqual([expect.objectContaining({ subjectId: "doctor-lin", stance: "knows" })])
    expect(snapshot.memory.state.values).toEqual([{ key: "clinic-door:locked", value: true }])
    expect(snapshot.planning).toMatchObject({ blueprintPages: 2, confirmedBlueprints: 2 })
    expect(snapshot.style).toMatchObject({ craftPages: 2, confirmedPages: 2 })
    expect(snapshot.writing.runs).toEqual([expect.objectContaining({ status: "approved", recordedSegments: 1 })])
    expect(snapshot.versions).toMatchObject({ approvedRevisions: 1, activeFinalChapters: 1 })
    expect(JSON.stringify(snapshot)).not.toContain("PRIVATE_MANUSCRIPT_SENTINEL")
  })

  it("fails closed on a malformed confirmed Memory OS page", async () => {
    const workspace = await fixtureWorkspace()
    await writeFile(join(workspace, ".narrative/brain/l1/events/bad.md"), `---
id: "bad-event"
type: "story_event"
lifecycle: "confirmed"
---
<!-- novelcode:data:begin -->
\`\`\`json
{"memory_os_schema":"story-event/v1","event_type":"bad"}
\`\`\`
<!-- novelcode:data:end -->
`, "utf8")

    const snapshot = await readNovelWorkbenchSnapshot(workspace)
    expect(snapshot.memory.status).toBe("invalid")
    expect(snapshot.memory.events).toEqual([])
    expect(snapshot.memory.knowledge).toEqual([])
    expect(snapshot.warnings.join("\n")).toMatch(/snapshot rejected/i)
  })

  it("accepts a marker-only workspace without inventing V2 state", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "novelcode-web-marker-"))
    workspaces.push(workspace)
    await mkdir(join(workspace, ".novelcode"), { recursive: true })
    await writeFile(join(workspace, ".novelcode/noveldsh.json"), JSON.stringify({
      schema: "novelcode-dsh-workspace/v1",
      product: "novelcode-dsh",
      scope: "single-novel",
    }), "utf8")

    const snapshot = await readNovelWorkbenchSnapshot(workspace)
    expect(snapshot.workspace.mode).toBe("marker_only")
    expect(snapshot.project.status).toBe("marker_only")
    expect(snapshot.memory).toMatchObject({ status: "empty", events: [], knowledge: [] })
  })

  it("distinguishes a malformed V2 manifest from a marker-only workspace", async () => {
    const workspace = await fixtureWorkspace()
    await writeFile(join(workspace, ".narrative/v2/project.json"), "{not-json\n", "utf8")

    const snapshot = await readNovelWorkbenchSnapshot(workspace)
    expect(snapshot.workspace.mode).toBe("v2")
    expect(snapshot.project.status).toBe("invalid")
    expect(snapshot.project.projectId).toBeUndefined()
    expect(snapshot.warnings.join("\n")).toMatch(/manifest/i)
  })
})

async function fixtureWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "novelcode-web-fixture-"))
  workspaces.push(workspace)
  await Promise.all([
    ".narrative/v2/source-intake",
    ".narrative/analysis/v2/revision-a",
    ".narrative/brain/l1/events",
    ".narrative/brain/l1/knowledge",
    ".narrative/brain/l2",
    ".narrative/brain/l3/blueprints",
    ".narrative/brain/craft",
    ".narrative/drafts/synthetic-web/run-a",
    ".narrative/v2/gbrain-home/.gbrain",
  ].map((path) => mkdir(join(workspace, path), { recursive: true })))
  const manifest = {
    schema: "novelcode-project-v2",
    project_id: "synthetic-web",
    title: "合成工作台",
    language: "zh-CN",
    created_at: "2026-08-21T00:00:00.000Z",
  }
  await writeJson(workspace, ".narrative/v2/project.json", manifest)
  await writeFile(join(workspace, ".narrative/brain/gbrain.yml"), "version: 1\n", "utf8")
  await writePage(workspace, ".narrative/brain/l1/story-contract.md", "story_contract", "confirmed")
  await writePage(workspace, ".narrative/brain/l2/current-frame.md", "runtime_frame", "confirmed")
  await writePage(workspace, ".narrative/brain/l2/active-blueprint.md", "runtime_frame", "confirmed")
  await writePage(workspace, ".narrative/brain/l3/blueprints/chapter-001.md", "chapter_blueprint", "confirmed")
  await writePage(workspace, ".narrative/brain/craft/style-constitution.md", "style_constitution", "confirmed")
  await writePage(workspace, ".narrative/brain/craft/prose-profile.md", "prose_profile", "confirmed")
  await writeJson(workspace, ".narrative/v2/source-intake/registry.json", {
    schema: "novelcode-source-registry-v2",
    sources: [{ role: "research_material", active: true, files: [{ path: "source/research/clinic.txt" }] }],
  })
  await writeJson(workspace, ".narrative/analysis/v2/revision-a/manifest.json", {
    schema: "novelcode-source-analysis-v2",
    status: "materialized",
  })
  await writeFile(join(workspace, ".narrative/brain/l1/events/door.md"), memoryPage("event-door", "story_event", {
    memory_os_schema: "story-event/v1",
    event_type: "door_locked",
    story_time: { sequence: 2, label: "夜班开始" },
    narrative_position: { chapterIndex: 1, sceneId: "clinic", order: 1 },
    validity: { fromSequence: 2 },
    participants: ["doctor-lin"],
    causes: [],
    effects: [{ entityId: "clinic-door", fieldPath: "locked", operation: "set", next: true }],
    evidence_refs: [{ sourceId: "revision-a", revisionHash: "a".repeat(64), locator: "chapter:001/lines:1-1" }],
    recorded_at: "2026-08-21T00:00:00.000Z",
  }), "utf8")
  await writeFile(join(workspace, ".narrative/brain/l1/knowledge/door.md"), memoryPage("claim-door", "knowledge_claim", {
    memory_os_schema: "knowledge-claim/v1",
    claim_id: "clinic-door-is-locked",
    subject_id: "doctor-lin",
    stance: "knows",
    confidence: 1,
    acquired_at: { sequence: 2 },
    evidence_refs: [{ sourceId: "revision-a", revisionHash: "a".repeat(64), locator: "chapter:001/lines:1-1" }],
    visibility_scope: ["doctor-lin"],
  }), "utf8")
  const manuscript = "PRIVATE_MANUSCRIPT_SENTINEL"
  const hash = createHash("sha256").update(manuscript).digest("hex")
  await writeFile(join(workspace, ".narrative/drafts/synthetic-web/run-a/segment.txt"), manuscript, "utf8")
  await writeJson(workspace, ".narrative/drafts/synthetic-web/run-a/manifest.json", {
    schema: "novelcode-writing-run-v2",
    run_id: "run-a",
    project_id: "synthetic-web",
    blueprint_id: "chapter-001",
    chapter_index: 1,
    chapter_title: "夜班门禁",
    status: "approved",
    target_chars: 100,
    min_chars: 80,
    created_at: "2026-08-21T00:00:00.000Z",
    updated_at: "2026-08-21T00:01:00.000Z",
    approved_revision_id: "revision-a",
    approved_content_sha256: hash,
    segments: [{ status: "recorded" }],
  })
  await writeJson(workspace, ".narrative/v2/final-append-ledger.json", [{
    hash,
    chapter_index: 1,
    revision: "revision-a",
    source_path: ".narrative/exports/chapters/chapter-001/revision-a.txt",
    active: true,
  }])
  await writeFile(join(workspace, ".narrative/v2/gbrain-home/.gbrain/config.json"), "{}\n", "utf8")
  return workspace
}

async function writeJson(workspace: string, path: string, value: unknown): Promise<void> {
  await writeFile(join(workspace, path), `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

async function writePage(workspace: string, path: string, type: string, lifecycle: string): Promise<void> {
  await mkdir(join(workspace, path, ".."), { recursive: true }).catch(() => {})
  await writeFile(join(workspace, path), `---\nid: "${type}"\ntype: "${type}"\nlifecycle: "${lifecycle}"\n---\n`, "utf8")
}

function memoryPage(id: string, type: string, data: unknown): string {
  return `---\nid: "${id}"\ntype: "${type}"\nlifecycle: "confirmed"\n---\n<!-- novelcode:data:begin -->\n\`\`\`json\n${JSON.stringify(data)}\n\`\`\`\n<!-- novelcode:data:end -->\n`
}
