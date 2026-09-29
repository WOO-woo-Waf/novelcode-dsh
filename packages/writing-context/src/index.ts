import { createHash } from "node:crypto"
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises"
import { dirname, relative, resolve, sep } from "node:path"
import { OpenVikingClient } from "@novelcode-dsh/openviking"
import type { NarrativeToolResult, JsonValue } from "@novelcode-dsh/contracts"

export type ResourceKind = "source" | "reference" | "guidance"
export interface ResourceEntry {
  path: string; hash: string; kind: ResourceKind; uri: string; state: string
  chapter?: number
  task_id?: string
}
export interface ContextOptions { maxChars?: number; limit?: number }
interface Catalog { schema: "novel-openviking/v1"; entries: ResourceEntry[] }
const catalogPath = ".novelcode/openviking.json"
export function workspaceUri(workspace: string): string {
  return "viking://resources/novel-" + createHash("sha256").update(resolve(workspace)).digest("hex").slice(0, 16)
}
async function localPath(workspace: string, name: string): Promise<string> {
  const root = await realpath(workspace)
  const path = resolve(root, name)
  if (path === root || !path.startsWith(root + sep)) throw new Error("Expected a file in this novel workspace")
  // Existing files may be symlinks; keep source and packet identity within the selected novel.
  const actual = await realpath(path).catch((e: NodeJS.ErrnoException) => { if (e.code === "ENOENT") return path; throw e })
  if (!actual.startsWith(root + sep)) throw new Error("File resolves outside this novel workspace")
  return actual
}
async function readCatalog(workspace: string): Promise<Catalog> {
  try {
    const parsed = JSON.parse(await readFile(await localPath(workspace, catalogPath), "utf8")) as Catalog
    if (parsed.schema !== "novel-openviking/v1" || !Array.isArray(parsed.entries)) throw new Error("Invalid OpenViking catalog")
    return parsed
  } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return { schema: "novel-openviking/v1", entries: [] }; throw e }
}
async function jsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = path + ".tmp"
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n")
  await rename(temporary, path)
}
export class NovelContext {
  constructor(readonly client: OpenVikingClient, readonly options: ContextOptions = {}) {}
  async status(workspace: string, signal?: AbortSignal) {
    const catalog = await readCatalog(workspace)
    for (const entry of catalog.entries) {
      if (entry.state !== "pending" || !entry.task_id) continue
      const task = await this.client.resourceStatus(entry.task_id, signal ? { signal } : {})
      entry.state = task.state
      if (task.root_uri) entry.uri = task.root_uri
    }
    if (catalog.entries.length) await jsonFile(await localPath(workspace, catalogPath), catalog)
    return { endpoint: this.clientEndpointLabel(), root: workspaceUri(await realpath(workspace)), entries: catalog.entries, health: await this.client.health(signal ? { signal } : {}) }
  }
  private clientEndpointLabel() { return "configured-openviking" }
  async importFiles(workspace: string, paths: string[], kind: ResourceKind, chapter?: number, signal?: AbortSignal) {
    if (!["source", "reference", "guidance"].includes(kind)) throw new Error("Unknown source kind")
    if (!paths.length) throw new Error("At least one workspace file is required")
    if (chapter !== undefined && (!Number.isSafeInteger(chapter) || chapter < 1)) throw new Error("chapter must be a positive integer")
    const root = await realpath(workspace)
    const catalog = await readCatalog(root)
    const imported: ResourceEntry[] = []
    for (const name of paths) {
      const path = await localPath(root, name)
      const hash = createHash("sha256").update(await readFile(path)).digest("hex")
      const local = relative(root, path)
      const existing = catalog.entries.find(e => e.path === local && e.hash === hash && e.kind === kind && e.chapter === chapter && e.state === "ready")
      if (existing) { imported.push(existing); continue }
      const identity = createHash("sha256").update(local + ":" + hash + ":" + (chapter ?? "all")).digest("hex").slice(0, 20)
      const result = await this.client.addResource(path, { targetUri: workspaceUri(root) + "/" + kind + "/" + identity, wait: true, ...(signal ? { signal } : {}) })
      if (!result.root_uri) throw new Error("OpenViking ingestion has no root_uri; no searchable receipt was saved")
      const entry: ResourceEntry = { path: local, hash, kind, uri: result.root_uri, state: result.state, ...(result.task_id ? { task_id: result.task_id } : {}), ...(chapter === undefined ? {} : { chapter }) }
      catalog.entries = catalog.entries.filter(e => !(e.path === local && e.kind === kind && e.chapter === chapter))
      catalog.entries.push(entry)
      await jsonFile(await localPath(root, catalogPath), catalog)
      imported.push(entry)
    }
    return imported
  }
  async recall(workspace: string, query: string, kind?: ResourceKind, chapter?: number, signal?: AbortSignal) {
    const catalog = await readCatalog(workspace)
    const selected = catalog.entries.filter(e => e.state === "ready" && (!kind || e.kind === kind) && (e.chapter === undefined || e.chapter === chapter))
    const limit = Math.max(1, Math.min(8, this.options.limit ?? 3))
    const candidates: Array<{ uri: string; abstract: string; score: number; kind: ResourceKind; source_path: string; source_hash: string; content: string }> = []
    if (!selected.length) return []
    // One retrieval per route, rather than one model/retrieval request per file.
    const target = workspaceUri(await realpath(workspace)) + (kind ? "/" + kind : "")
    const matches = await this.client.find(query, target, limit * 4, signal ? { signal } : {})
    const hashes = new Map<string, string>()
    for (const match of matches) {
      const entry = selected.find(e => match.uri === e.uri || match.uri.startsWith(e.uri.replace(/\/$/, "") + "/"))
      if (!entry) continue
      if (signal?.aborted) throw signal.reason ?? new Error("Cancelled")
      let hash = hashes.get(entry.path)
      if (!hash) {
        hash = createHash("sha256").update(await readFile(await localPath(workspace, entry.path))).digest("hex")
        hashes.set(entry.path, hash)
      }
      if (hash !== entry.hash) continue
      candidates.push({ uri: match.uri, abstract: match.abstract ?? "", score: match.score ?? 0, kind: entry.kind, source_path: entry.path, source_hash: hash, content: "" })
    }
    const ranked = [...new Map(candidates.sort((a,b) => b.score-a.score).map(e => [e.uri, e])).values()].slice(0, limit)
    let remaining = Math.max(0, Math.min(16000, this.options.maxChars ?? 6000))
    const results: typeof ranked = []
    for (const hit of ranked) {
      if (!remaining) break
      const raw = await this.client.read(hit.uri, { limit: 120, ...(signal ? { signal } : {}) })
      hit.content = raw.slice(0, remaining)
      remaining -= hit.content.length
      results.push(hit)
    }
    return results
  }
  async enhanceWriting(workspace: string, result: NarrativeToolResult, signal?: AbortSignal): Promise<NarrativeToolResult> {
    signal?.throwIfAborted()
    if (!result.success) return result
    const payload = record(result.payload)
    if (typeof payload.manifest_path !== "string") throw new Error("Writing result has no manifest_path")
    const manifestPath = await localPath(workspace, payload.manifest_path)
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
    const updated = []
    let hits = 0
    const warnings: string[] = []
    for (const segment of manifest.segments) {
      const nativePath = segment.native_instruction_path ?? segment.instruction_path
      const originalPath = await localPath(workspace, nativePath)
      const packet = JSON.parse(await readFile(originalPath, "utf8"))
      const scene = record(packet.segment)
      const query = [scene.title, scene.goal, scene.pov, scene.scene_mode, scene.event_function, ...(Array.isArray(scene.participants) ? scene.participants : [])].filter(x => typeof x === "string").join(" ")
      let resources: Awaited<ReturnType<NovelContext["recall"]>> = []
      let guidance: typeof resources = []
      try {
        const recalled = await Promise.all([
          this.recall(workspace, query, "source", manifest.chapter_index, signal),
          this.recall(workspace, query, "reference", manifest.chapter_index, signal),
          this.recall(workspace, query, "guidance", manifest.chapter_index, signal),
        ])
        resources = recalled[0]
        const refs = recalled[1]
        guidance = recalled[2]
        // Reserve room for all three objectives rather than letting source consume everything.
        const budget = Math.max(0, Math.min(16000, this.options.maxChars ?? 6000))
        let used = 0
        for (const [route, quota] of [[resources, Math.floor(budget / 2)], [guidance, Math.floor(budget / 4)], [refs, Math.floor(budget / 4)]] as const) {
          let remaining = quota
          for (const hit of route) {
            hit.content = hit.content.slice(0, remaining)
            remaining -= hit.content.length
            used += hit.content.length
          }
        }
        packet.what_to_write.openviking_source_context = resources.filter(x => x.content)
        packet.how_to_write.openviking_style_references = refs.filter(x => x.content)
        packet.how_to_write.openviking_author_guidance = guidance.filter(x => x.content)
        hits += [...resources, ...guidance, ...refs].filter(x => x.content).length
        packet.openviking = { status: "ready", query, source_of_truth: "Narrative V2 remains authoritative; source excerpts are context, style references are not plot facts", added_chars: used }
      } catch (e) {
        if (signal?.aborted) throw e
        warnings.push(String(e instanceof Error ? e.message : e))
        packet.openviking = { status: "degraded", query, reason: "retrieval_failed; original Narrative V2 packet retained" }
      }
      const enhanced = nativePath.replace(/\.json$/, ".openviking.json")
      if (enhanced === nativePath) throw new Error("Expected JSON instruction path")
      signal?.throwIfAborted()
      await jsonFile(await localPath(workspace, enhanced), packet)
      updated.push({ ...segment, native_instruction_path: nativePath, instruction_path: enhanced })
    }
    manifest.segments = updated
    signal?.throwIfAborted()
    await jsonFile(manifestPath, manifest)
    return {
      ...result,
      artifacts: [...result.artifacts, ...updated.map(s => s.instruction_path)],
      metrics: { ...result.metrics, openviking_context_hits: hits },
      warnings: [...(result.warnings ?? []), ...warnings],
      payload: { ...payload, segments: updated, openviking: { status: warnings.length ? "degraded" : "ready", hits, content_quality: "requires_author_review" } } as JsonValue,
      next: ["按返回的增强 instruction_path 写正文；连贯、人物、文风和状态同时检查。完成后让作者评正文，不以检索命中代替质量。"],
    }
  }
}
function record(value: unknown): Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}
}
