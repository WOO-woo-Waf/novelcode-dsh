import { access, readFile, readdir, realpath, stat } from "node:fs/promises"
import { join, relative, resolve, sep } from "node:path"
import { loadConfirmedMemorySnapshot } from "@novelcode-dsh/host-orchestration"
import { projectConfirmedState } from "@novelcode-dsh/memory-model"
import type { JsonValue } from "@novelcode-dsh/contracts"
import {
  NOVEL_WORKBENCH_SNAPSHOT_SCHEMA,
  emptyLifecycleCounts,
  type LifecycleCounts,
  type NovelWorkbenchSnapshot,
  type WorkbenchFinalEntry,
  type WorkbenchLifecycle,
  type WorkbenchWritingRun,
} from "./types.js"

const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_EVENTS = 200
const MAX_KNOWLEDGE = 500
const MAX_STATE_VALUES = 300
const MAX_RUNS = 100
const MAX_FINAL_ENTRIES = 200
const REQUIRED_PATHS = [
  ".narrative/v2/project.json",
  ".narrative/brain/gbrain.yml",
  ".narrative/brain/l1/story-contract.md",
  ".narrative/brain/l2/current-frame.md",
  ".narrative/brain/craft/style-constitution.md",
] as const
const LIFECYCLES = new Set([
  "observation",
  "candidate",
  "pending_review",
  "confirmed",
  "superseded",
  "archived",
])

interface PageMeta {
  path: string
  lifecycle: WorkbenchLifecycle
  type?: string
}

interface ProjectManifest {
  schema: "novelcode-project-v2"
  project_id: string
  title: string
  language: string
  created_at: string
}

export async function isNovelWorkbenchWorkspace(workspace: string): Promise<boolean> {
  const root = await realpath(workspace)
  if (await exists(join(root, ".narrative", "v2", "project.json"))) return true
  const marker = await readJson(join(root, ".novelcode", "noveldsh.json")).catch(() => undefined)
  return isRecord(marker)
    && marker.schema === "novelcode-dsh-workspace/v1"
    && marker.product === "novelcode-dsh"
    && marker.scope === "single-novel"
}

export async function readNovelWorkbenchSnapshot(
  workspace: string,
  signal: AbortSignal = new AbortController().signal,
): Promise<NovelWorkbenchSnapshot> {
  const root = await realpath(workspace)
  assertNotAborted(signal)
  if (!await isNovelWorkbenchWorkspace(root)) throw new Error("workspace is not bound to NovelCode DSH")

  const warnings: string[] = []
  const manifestPath = join(root, ".narrative", "v2", "project.json")
  const manifestPresent = await exists(manifestPath)
  const rawManifest = manifestPresent
    ? await readJson(manifestPath).catch((error: unknown) => {
        warnings.push(`project manifest unavailable: ${safeMessage(error)}`)
        return undefined
      })
    : undefined
  const manifest = parseProjectManifest(rawManifest)
  const markerOnly = !manifestPresent
  const invalidManifest = manifestPresent && manifest === undefined
  if (invalidManifest) warnings.push("project manifest is invalid; V2 details are hidden")

  const missingPaths = markerOnly
    ? [...REQUIRED_PATHS]
    : (await Promise.all(REQUIRED_PATHS.map(async (path) => [path, await exists(join(root, path))] as const)))
        .filter(([, present]) => !present)
        .map(([path]) => path)
  assertNotAborted(signal)

  const pages = markerOnly ? [] : await readPageMetadata(root, signal, warnings)
  const lifecycleCounts = pages.reduce((counts, page) => {
    const key = LIFECYCLES.has(page.lifecycle) ? page.lifecycle as keyof LifecycleCounts : "other"
    counts[key] += 1
    return counts
  }, emptyLifecycleCounts())
  const pageByPath = new Map(pages.map((page) => [page.path, page]))
  const authorGates = {
    storyContract: pageByPath.get(".narrative/brain/l1/story-contract.md")?.lifecycle ?? "missing" as const,
    styleConstitution: pageByPath.get(".narrative/brain/craft/style-constitution.md")?.lifecycle ?? "missing" as const,
    activeBlueprint: pageByPath.get(".narrative/brain/l2/active-blueprint.md")?.lifecycle ?? "missing" as const,
    proseProfile: pageByPath.get(".narrative/brain/craft/prose-profile.md")?.lifecycle ?? "missing" as const,
  }

  const source = markerOnly ? emptySources() : await readSources(root, signal, warnings)
  const memory = markerOnly
    ? emptyMemory(lifecycleCounts, pages.length)
    : await readMemory(root, lifecycleCounts, pages.length, signal, warnings)
  const writingRuns = markerOnly ? [] : await readWritingRuns(root, signal, warnings)
  const finalEntries = markerOnly ? [] : await readFinalEntries(root, warnings)

  const blueprintPages = pages.filter((page) =>
    page.type === "chapter_blueprint" || page.path.includes("/blueprints/") || page.path.endsWith("/active-blueprint.md"))
  const branchPages = pages.filter((page) =>
    page.type === "branch_hypothesis" || page.type === "branch_provenance" || page.path.includes("/branches/"))
  const craftPages = pages.filter((page) => page.path.includes("/.narrative/brain/craft/")
    || page.path.startsWith(".narrative/brain/craft/"))
  const pending = (page: PageMeta): boolean =>
    page.lifecycle === "observation" || page.lifecycle === "candidate" || page.lifecycle === "pending_review"

  return {
    schema: NOVEL_WORKBENCH_SNAPSHOT_SCHEMA,
    generatedAt: new Date().toISOString(),
    workspace: { bound: true, mode: markerOnly ? "marker_only" : "v2" },
    project: {
      status: markerOnly
        ? "marker_only"
        : invalidManifest
          ? "invalid"
          : missingPaths.length === 0
            ? "ready"
            : "degraded",
      ...(manifest === undefined ? {} : {
        projectId: manifest.project_id,
        title: manifest.title,
        language: manifest.language,
        createdAt: manifest.created_at,
      }),
      missingPaths,
      authorGates,
      derivedIndex: await exists(join(root, ".narrative", "v2", "gbrain-home", ".gbrain", "config.json"))
        ? "connected"
        : "not_initialized",
    },
    sources: source,
    memory,
    planning: {
      blueprintPages: blueprintPages.length,
      confirmedBlueprints: blueprintPages.filter((page) => page.lifecycle === "confirmed").length,
      branchPages: branchPages.length,
      pendingPages: [...blueprintPages, ...branchPages].filter(pending).length,
    },
    style: {
      craftPages: craftPages.length,
      confirmedPages: craftPages.filter((page) => page.lifecycle === "confirmed").length,
      pendingPages: craftPages.filter(pending).length,
      revisionPreferencePages: craftPages.filter((page) =>
        page.type === "revision_preference" || page.path.includes("revision-preference")).length,
    },
    writing: {
      runs: writingRuns,
      statusCounts: countBy(writingRuns.map((run) => run.status)),
    },
    versions: {
      approvedRevisions: writingRuns.filter((run) => run.status === "approved").length,
      finalEntries,
      activeFinalChapters: finalEntries.filter((entry) => entry.active).length,
    },
    warnings: unique(warnings),
  }
}

async function readMemory(
  root: string,
  lifecycleCounts: LifecycleCounts,
  markdownPages: number,
  signal: AbortSignal,
  warnings: string[],
): Promise<NovelWorkbenchSnapshot["memory"]> {
  try {
    const snapshot = await loadConfirmedMemorySnapshot(root)
    assertNotAborted(signal)
    const throughSequence = snapshot.events.reduce((max, event) => Math.max(max, event.storyTime.sequence), 0)
    const projection = projectConfirmedState(snapshot.events, throughSequence)
    if (snapshot.events.length > MAX_EVENTS) warnings.push(`timeline truncated to ${MAX_EVENTS} events`)
    if (snapshot.knowledge.length > MAX_KNOWLEDGE) warnings.push(`knowledge matrix truncated to ${MAX_KNOWLEDGE} claims`)
    const stateEntries = Object.entries(projection.values)
    if (stateEntries.length > MAX_STATE_VALUES) warnings.push(`state projection truncated to ${MAX_STATE_VALUES} values`)
    return {
      status: snapshot.events.length === 0 && snapshot.knowledge.length === 0 ? "empty" : "ready",
      baselineCanonHash: snapshot.baselineCanonHash,
      markdownPages,
      lifecycleCounts,
      events: snapshot.events.toSorted((left, right) => left.storyTime.sequence - right.storyTime.sequence
        || left.narrativePosition.order - right.narrativePosition.order
        || left.id.localeCompare(right.id)).slice(0, MAX_EVENTS).map((event) => ({
          id: event.id,
          eventType: event.eventType,
          sequence: event.storyTime.sequence,
          ...(event.storyTime.label === undefined ? {} : { label: event.storyTime.label }),
          chapterIndex: event.narrativePosition.chapterIndex,
          ...(event.narrativePosition.sceneId === undefined ? {} : { sceneId: event.narrativePosition.sceneId }),
          participants: event.participants.slice(0, 20),
          causes: event.causes.slice(0, 20),
          effectKeys: event.effects.slice(0, 30).map((effect) => `${effect.entityId}:${effect.fieldPath}`),
        })),
      knowledge: snapshot.knowledge.toSorted((left, right) => left.subjectId.localeCompare(right.subjectId)
        || left.claimId.localeCompare(right.claimId)
        || left.acquiredAt.sequence - right.acquiredAt.sequence).slice(0, MAX_KNOWLEDGE).map((claim) => ({
          id: claim.id,
          claimId: claim.claimId,
          subjectId: claim.subjectId,
          stance: claim.stance,
          confidence: claim.confidence,
          acquiredAtSequence: claim.acquiredAt.sequence,
          ...(claim.validUntilSequence === undefined ? {} : { validUntilSequence: claim.validUntilSequence }),
          visibilityScope: claim.visibilityScope.slice(0, 20),
        })),
      state: {
        throughSequence,
        values: stateEntries.slice(0, MAX_STATE_VALUES).map(([key, value]) => ({
          key,
          value: compactJson(value),
        })),
        appliedEvents: projection.appliedEventIds.length,
        conflicts: projection.conflicts.length,
      },
    }
  } catch (error) {
    warnings.push(`confirmed Memory OS snapshot rejected: ${safeMessage(error)}`)
    return { ...emptyMemory(lifecycleCounts, markdownPages), status: "invalid" }
  }
}

function emptyMemory(lifecycleCounts: LifecycleCounts, markdownPages: number): NovelWorkbenchSnapshot["memory"] {
  return {
    status: "empty",
    baselineCanonHash: "",
    markdownPages,
    lifecycleCounts,
    events: [],
    knowledge: [],
    state: { throughSequence: 0, values: [], appliedEvents: 0, conflicts: 0 },
  }
}

async function readPageMetadata(root: string, signal: AbortSignal, warnings: string[]): Promise<PageMeta[]> {
  const brain = join(root, ".narrative", "brain")
  const files = await filesUnder(brain, ".md", signal)
  const pages: PageMeta[] = []
  for (const target of files.toSorted()) {
    assertNotAborted(signal)
    try {
      const text = await readBounded(target)
      const frontmatter = parseFrontmatter(text)
      if (frontmatter === undefined) continue
      const lifecycleValue = stringValue(frontmatter.lifecycle) || stringValue(frontmatter.approval_state)
      const lifecycle = (LIFECYCLES.has(lifecycleValue) ? lifecycleValue : lifecycleValue.length === 0 ? "missing" : "invalid") as WorkbenchLifecycle
      pages.push({
        path: workspaceRelative(root, target),
        lifecycle,
        ...(stringValue(frontmatter.type).length === 0 ? {} : { type: stringValue(frontmatter.type) }),
      })
    } catch (error) {
      warnings.push(`page metadata skipped: ${workspaceRelative(root, target)} (${safeMessage(error)})`)
    }
  }
  return pages
}

async function readSources(
  root: string,
  signal: AbortSignal,
  warnings: string[],
): Promise<NovelWorkbenchSnapshot["sources"]> {
  const registry = await readJson(join(root, ".narrative", "v2", "source-intake", "registry.json"))
    .catch((error: unknown) => {
      if (!isMissing(error)) warnings.push(`source registry skipped: ${safeMessage(error)}`)
      return undefined
    })
  const sources = isRecord(registry) && Array.isArray(registry.sources)
    ? registry.sources.filter(isRecord)
    : []
  const analysisFiles = await filesUnder(join(root, ".narrative", "analysis", "v2"), ".json", signal)
  const statuses: string[] = []
  for (const target of analysisFiles) {
    const candidate = await readJson(target).catch(() => undefined)
    if (!isRecord(candidate) || candidate.schema !== "novelcode-source-analysis-v2") continue
    const status = stringValue(candidate.status)
    if (status.length > 0) statuses.push(status)
  }
  const roles = sources.map((source) => stringValue(source.role)).filter(Boolean)
  return {
    registered: sources.length,
    active: sources.filter((source) => source.active !== false).length,
    files: sources.reduce((total, source) => total + (Array.isArray(source.files) ? source.files.length : 0), 0),
    roleCounts: countBy(roles),
    analysisRevisions: statuses.length,
    analysisStatusCounts: countBy(statuses),
  }
}

function emptySources(): NovelWorkbenchSnapshot["sources"] {
  return { registered: 0, active: 0, files: 0, roleCounts: {}, analysisRevisions: 0, analysisStatusCounts: {} }
}

async function readWritingRuns(
  root: string,
  signal: AbortSignal,
  warnings: string[],
): Promise<WorkbenchWritingRun[]> {
  const files = await filesUnder(join(root, ".narrative", "drafts"), "manifest.json", signal, true)
  const runs: WorkbenchWritingRun[] = []
  for (const target of files.toSorted()) {
    assertNotAborted(signal)
    const value = await readJson(target).catch((error: unknown) => {
      warnings.push(`writing manifest skipped: ${workspaceRelative(root, target)} (${safeMessage(error)})`)
      return undefined
    })
    if (!isWritingManifest(value)) continue
    const segments = value.segments.filter(isRecord)
    runs.push({
      runId: value.run_id,
      blueprintId: value.blueprint_id,
      chapterIndex: value.chapter_index,
      chapterTitle: compactString(value.chapter_title, 120),
      status: value.status,
      segments: segments.length,
      recordedSegments: segments.filter((segment) => segment.status === "recorded").length,
      shortSegments: segments.filter((segment) => segment.status === "short").length,
      updatedAt: value.updated_at,
      ...(typeof value.approved_revision_id === "string" ? { approvedRevisionId: value.approved_revision_id } : {}),
      ...(typeof value.approved_content_sha256 === "string" ? { approvedContentSha256: value.approved_content_sha256 } : {}),
    })
  }
  const selected = runs.toSorted((left, right) => right.chapterIndex - left.chapterIndex
    || right.updatedAt.localeCompare(left.updatedAt))
  if (selected.length > MAX_RUNS) warnings.push(`writing runs truncated to ${MAX_RUNS}`)
  return selected.slice(0, MAX_RUNS)
}

async function readFinalEntries(root: string, warnings: string[]): Promise<WorkbenchFinalEntry[]> {
  const target = join(root, ".narrative", "v2", "final-append-ledger.json")
  const value = await readJson(target).catch((error: unknown) => {
    if (!isMissing(error)) warnings.push(`final ledger skipped: ${safeMessage(error)}`)
    return undefined
  })
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    warnings.push("final ledger is invalid")
    return []
  }
  const entries = value.flatMap((item): WorkbenchFinalEntry[] => {
    if (!isRecord(item)
      || !Number.isSafeInteger(item.chapter_index)
      || typeof item.revision !== "string"
      || typeof item.hash !== "string") return []
    return [{
      chapterIndex: item.chapter_index as number,
      revision: item.revision,
      hash: item.hash,
      active: item.active !== false,
    }]
  }).toSorted((left, right) => left.chapterIndex - right.chapterIndex || left.revision.localeCompare(right.revision))
  if (entries.length > MAX_FINAL_ENTRIES) warnings.push(`final ledger truncated to ${MAX_FINAL_ENTRIES} entries`)
  return entries.slice(0, MAX_FINAL_ENTRIES)
}

function parseProjectManifest(value: unknown): ProjectManifest | undefined {
  if (!isRecord(value)
    || value.schema !== "novelcode-project-v2"
    || typeof value.project_id !== "string"
    || typeof value.title !== "string"
    || typeof value.language !== "string"
    || typeof value.created_at !== "string") return undefined
  return value as unknown as ProjectManifest
}

function isWritingManifest(value: unknown): value is {
  schema: "novelcode-writing-run-v2"
  run_id: string
  blueprint_id: string
  chapter_index: number
  chapter_title: string
  status: "drafting" | "evaluated" | "approved"
  updated_at: string
  segments: unknown[]
  approved_revision_id?: string
  approved_content_sha256?: string
} {
  if (!isRecord(value)) return false
  return value.schema === "novelcode-writing-run-v2"
    && typeof value.run_id === "string"
    && typeof value.blueprint_id === "string"
    && Number.isSafeInteger(value.chapter_index)
    && typeof value.chapter_title === "string"
    && (value.status === "drafting" || value.status === "evaluated" || value.status === "approved")
    && typeof value.updated_at === "string"
    && Array.isArray(value.segments)
}

function parseFrontmatter(text: string): Record<string, unknown> | undefined {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u)
  if (match === null) return undefined
  return Object.fromEntries(match[1]!.split(/\r?\n/u).flatMap((line) => {
    const separator = line.indexOf(":")
    if (separator < 1) return []
    const key = line.slice(0, separator).trim()
    const raw = line.slice(separator + 1).trim()
    try {
      return [[key, raw.length === 0 ? "" : JSON.parse(raw) as unknown]]
    } catch {
      return [[key, raw]]
    }
  }))
}

async function filesUnder(
  root: string,
  suffix: string,
  signal: AbortSignal,
  exactName = false,
): Promise<string[]> {
  assertNotAborted(signal)
  const entries = await readdir(root, { withFileTypes: true }).catch((error: unknown) => {
    if (isMissing(error)) return []
    throw error
  })
  const nested = await Promise.all(entries.map(async (entry) => {
    assertNotAborted(signal)
    const target = join(root, entry.name)
    if (entry.isDirectory()) return filesUnder(target, suffix, signal, exactName)
    const matches = exactName ? entry.name === suffix : entry.name.endsWith(suffix)
    return entry.isFile() && matches ? [target] : []
  }))
  return nested.flat()
}

async function readJson(target: string): Promise<unknown> {
  return JSON.parse(await readBounded(target)) as unknown
}

async function readBounded(target: string): Promise<string> {
  const info = await stat(target)
  if (!info.isFile()) throw new Error("not a file")
  if (info.size > MAX_FILE_BYTES) throw new Error(`file exceeds ${MAX_FILE_BYTES} bytes`)
  return await readFile(target, "utf8")
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

function workspaceRelative(root: string, target: string): string {
  const selected = relative(root, resolve(target))
  if (selected === ".." || selected.startsWith(`..${sep}`)) throw new Error("path escaped workspace")
  return selected.split(sep).join("/")
}

function compactJson(value: JsonValue, depth = 0): JsonValue {
  if (typeof value === "string") return compactString(value, 256)
  if (value === null || typeof value === "number" || typeof value === "boolean") return value
  if (depth >= 3) return "[nested value omitted]"
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => compactJson(item, depth + 1))
  return Object.fromEntries(Object.entries(value).slice(0, 30)
    .map(([key, selected]) => [key, compactJson(selected, depth + 1)]))
}

function compactString(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit)}…`
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new Error("workbench snapshot cancelled")
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

function safeMessage(error: unknown): string {
  return compactString(error instanceof Error ? error.message : String(error), 240)
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}
