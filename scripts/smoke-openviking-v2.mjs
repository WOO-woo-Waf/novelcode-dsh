import assert from "node:assert/strict"
import { createServer } from "node:http"
import { once } from "node:events"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { JsonlSidecarProvider, sidecarLaunchFromEnv } from "../packages/jsonl-provider/lib/index.js"
import { OpenVikingClient } from "../packages/openviking/lib/index.js"
import { NovelContext } from "../packages/writing-context/lib/index.js"

// Real Narrative V2 transport and files, synthetic OpenViking HTTP contract.
// No model, real OpenViking retrieval-quality claim, or private novel data.
const coreRoot = process.env.NOVELCODE_DSH_CORE_ROOT
if (!coreRoot) throw new Error("set NOVELCODE_DSH_CORE_ROOT to a readable Novel Workbench checkout")
const workspace = await mkdtemp(join(tmpdir(), "novelcode-openviking-v2-"))
const provider = new JsonlSidecarProvider({
  launch: sidecarLaunchFromEnv({ ...process.env, NOVELCODE_DSH_CORE_ROOT: resolve(coreRoot) }),
  requestTimeoutMs: 30_000,
})
const uploads = new Map()
const resources = new Map()
const requests = { upload: 0, add: 0, find: 0, read: 0 }
const checks = []
let sidecarActions = 0
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost")
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const buffer = Buffer.concat(chunks)
    let result
    if (request.method === "POST" && url.pathname === "/api/v1/resources/temp_upload") {
      const form = await new Request(url, { method: "POST", headers: request.headers, body: buffer }).formData()
      const file = form.get("file")
      assert.ok(file && typeof file.text === "function", "actual multipart file must be uploaded")
      const id = `fixture-upload-${++requests.upload}`
      uploads.set(id, await file.text())
      result = { temp_file_id: id }
    } else if (request.method === "POST" && url.pathname === "/api/v1/resources") {
      const body = JSON.parse(buffer.toString())
      assert.equal(body.wait, true)
      assert.equal(body.path, undefined, "local paths must not be sent as server paths")
      assert.ok(uploads.has(body.temp_file_id))
      resources.set(body.to, uploads.get(body.temp_file_id))
      requests.add++
      result = { status: "success", root_uri: body.to }
    } else if (request.method === "POST" && url.pathname === "/api/v1/search/find") {
      const body = JSON.parse(buffer.toString())
      assert.ok(body.query.includes("顾岚"), "search must derive from the real segment")
      requests.find++
      result = { resources: [...resources.keys()].filter(uri => uri.startsWith(body.target_uri + "/"))
        .slice(0, body.limit).map(uri => ({ uri, score: 1, abstract: "synthetic fixture", context_type: "resource" })) }
    } else if (request.method === "GET" && url.pathname === "/api/v1/content/read") {
      const uri = url.searchParams.get("uri")
      assert.ok(resources.has(uri))
      requests.read++
      result = resources.get(uri)
    } else throw new Error(`Unexpected fixture endpoint: ${request.method} ${url.pathname}`)
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ status: "ok", result }))
  } catch (error) {
    response.writeHead(500, { "content-type": "application/json" })
    response.end(JSON.stringify({ status: "error", error: String(error) }))
  }
})

try {
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const context = new NovelContext(new OpenVikingClient({ endpoint: `http://127.0.0.1:${server.address().port}` }), { maxChars: 6000 })
  await run({ action: "narrative_project_init", project_id: "synthetic-openviking-v2", project_title: "合成地图续写", language: "zh-CN" })
  await confirm(await run({ action: "narrative_story_contract_propose", payload: {
    id: "fixture-story", core_promise: "档案员核对变化的城市地图。", protagonist: "顾岚", desire: "保留可靠见证",
    central_conflict: "交换地图会改变岸线", stakes: "搭档间信任受损", ending_direction: "保留并列见证",
    genre_boundaries: ["悬疑"], author_constraints: ["本章不能揭示异常机制"],
  } }))
  await confirm(await run({ action: "narrative_style_constitution_propose", payload: {
    id: "fixture-style", viewpoint: "顾岚的有限视角", cadence: "先舒展后收紧", diction: "克制具体",
    dialogue: "保留回避与停顿", imagery: "物象改变判断", pacing: "因果完成后转场",
    must_apply: ["用动作表现疑虑"], must_avoid: ["直接命名目标情绪"], evidence: [],
  } }))
  const blueprint = await run({ action: "narrative_blueprint_propose", payload: {
    blueprint_id: "fixture-chapter", title: "岸线", chapter_index: 1, chapter_function: "建立异常与信任代价",
    entry_state: "相信地图只是印错", exit_state: "保存双方见证", required_changes: ["建立离线封存"],
    forbidden_changes: ["揭示异常机制"], reveals: ["换手导致地图变化"], withheld_information: ["变化原因"],
    relationship_pressure: ["顾岚试探沈拓"], tracker_moves: ["七码头线索开启"], target_chars: 240, min_chars: 160,
    segments: [1, 2].map(index => ({
      segment_id: `fixture-segment-${index}`, title: index === 1 ? "交换地图" : "封存地图",
      goal: index === 1 ? "顾岚验证岸线变化" : "顾岚要求沈拓签名封存", entry_state: "证据不稳", exit_state: "留下代价",
      required_changes: ["保存观察结果"], forbidden_changes: ["解释谜底"], scene_mode: "investigation",
      event_function: "rule_revelation", pov: "顾岚", narrator: "third_person_limited", participants: ["顾岚", "沈拓"],
      relationship_pattern: "fragile_trust", information_state: { reader_knows: ["地图不同"], pov_knows: ["换手触发变化"], withheld: ["原因"] },
      pressure_curve: "steady_then_spike", intended_reader_effects: ["unease"], representation_needs: ["micro_action"], target_chars: 120, min_chars: 80,
    })),
  } })
  const proposal = blueprint.payload.proposal_id
  await run({ action: "narrative_memory_submit_review", payload: { proposal_id: proposal } })
  await run({ action: "narrative_blueprint_confirm", payload: { proposal_id: proposal, confirmation: "author_confirmed" } })
  const prepared = await run({ action: "narrative_writing_prepare", payload: { blueprint_id: "fixture-chapter" } })
  const manifestPath = prepared.payload.manifest_path
  const originalManifest = await json(manifestPath)
  const nativePackets = await Promise.all(originalManifest.segments.map(segment => json(segment.instruction_path)))
  check("real-v2-segments", () => assert.equal(nativePackets.length, 2))
  check("confirmed-story-in-packet", () => assert.ok(JSON.stringify(nativePackets[0].what_to_write.story_contract).includes("档案员")))
  check("confirmed-style-in-packet", () => assert.ok(JSON.stringify(nativePackets[0].how_to_write.style_constitution).includes("有限视角")))
  check("conditional-craft-in-packet", () => assert.ok(nativePackets[0].how_to_write.compiled_craft_checklist.length > 0))
  await writeFile(join(workspace, "fixture-draft.txt"), "顾岚把地图推到沈拓面前，等他指出岸线才交换纸张。七码头偏向另一侧。她没有解释，把两张图分别编号；沈拓伸手时，她先合上档案盒，请他在封条上签名。窗外车轮碾过积水，她等那声音过去，仍没有移开手。")
  await run({ action: "narrative_segment_record", payload: { manifest_path: manifestPath, segment_id: "fixture-segment-1", source_path: "fixture-draft.txt" } })
  await run({ action: "narrative_segment_handoff", payload: { manifest_path: manifestPath, segment_id: "fixture-segment-1", summary: "两人换手后地图改变。", exit_state: "准备封存。", knowledge_changes: ["顾岚确认换手触发变化"], unresolved_pressure: ["沈拓尚未签名"] } })
  const handoffPath = nativePackets[1].continuity.previous_handoff_path
  const handoff = await readFile(join(workspace, handoffPath), "utf8")
  check("actual-previous-handoff-exists", () => assert.ok(handoff.includes("沈拓尚未签名")))
  const fixtures = [
    ["source.md", "source", "顾岚握住地图边缘，沈拓还没有签名。"],
    ["style.md", "reference", "只写可见动作与对白停顿，不替读者总结情绪。"],
    ["guidance.md", "guidance", "顾岚不知道异常原因。她说话克制；沈拓回避签名。"],
  ]
  for (const [name, kind, text] of fixtures) {
    await writeFile(join(workspace, name), text.repeat(500))
    const receipts = await context.importFiles(workspace, [name], kind)
    check(`import-${kind}-ready`, () => assert.equal(receipts[0].state, "ready"))
  }
  const enhanced = await context.enhanceWriting(workspace, prepared)
  const manifest = await json(manifestPath)
  check("enhancement-ready", () => assert.equal(enhanced.payload.openviking.status, "ready"))
  check("six-context-hits", () => assert.equal(enhanced.metrics.openviking_context_hits, 6))
  for (const [index, segment] of manifest.segments.entries()) {
    const packet = await json(segment.instruction_path)
    const native = nativePackets[index]
    check(`segment-${index}-consumed-path`, () => {
      assert.notEqual(segment.instruction_path, originalManifest.segments[index].instruction_path)
      assert.equal(enhanced.payload.segments[index].instruction_path, segment.instruction_path)
      assert.ok(enhanced.artifacts.includes(segment.instruction_path))
    })
    check(`segment-${index}-native-unchanged`, () => assert.deepEqual(packetWithoutExtras(packet), native))
    const retainedNative = await json(segment.native_instruction_path)
    check(`segment-${index}-native-file-retained`, () => assert.deepEqual(retainedNative, native))
    const routes = [packet.what_to_write.openviking_source_context, packet.how_to_write.openviking_style_references, packet.how_to_write.openviking_author_guidance]
    check(`segment-${index}-three-routes`, () => assert.deepEqual(routes.map(route => route[0]?.kind), ["source", "reference", "guidance"]))
    const chars = routes.flat().reduce((sum, hit) => sum + hit.content.length, 0)
    check(`segment-${index}-budget`, () => { assert.equal(chars, 6000); assert.equal(packet.openviking.added_chars, chars) })
  }
  const retainedHandoff = await readFile(join(workspace, handoffPath), "utf8")
  check("handoff-body-retained", () => assert.equal(retainedHandoff, handoff))
  check("actual-http-contract-counts", () => assert.deepEqual(requests, { upload: 3, add: 3, find: 6, read: 6 }))
  await run({ action: "narrative_segment_record", payload: { manifest_path: manifestPath, segment_id: "fixture-segment-2", source_path: "fixture-draft.txt" } })
  const continued = await json(manifestPath)
  check("native-record-after-enhancement", () => assert.equal(continued.segments[1].status, "recorded"))
  process.stdout.write(JSON.stringify({ workflow: "real-narrative-v2-synthetic-openviking", checks: checks.length, sidecarActions, requests, segments: 2, addedCharsPerSegment: 6000, modelCalls: 0, contentQuality: "not-evaluated-requires-author", workspace: "temporary-cleaned-after-run" }) + "\n")
} finally {
  provider.close()
  server.closeAllConnections()
  if (server.listening) await new Promise((done, reject) => server.close(error => error ? reject(error) : done()))
  await rm(workspace, { recursive: true, force: true })
}

function check(name, verify) { verify(); checks.push(name) }
async function json(path) { return JSON.parse(await readFile(join(workspace, path), "utf8")) }
async function run(input) {
  const result = await provider.execute(input, { workspace })
  assert.equal(result.success, true, `${input.action}: ${result.summary}`)
  sidecarActions++
  return result
}
async function confirm(result) {
  const proposal_id = result.payload.proposal_id
  await run({ action: "narrative_memory_submit_review", payload: { proposal_id } })
  await run({ action: "narrative_memory_confirm", payload: { proposal_id, confirmation: "author_confirmed" } })
}
function packetWithoutExtras(value) {
  const packet = structuredClone(value)
  delete packet.openviking
  delete packet.what_to_write.openviking_source_context
  delete packet.how_to_write.openviking_style_references
  delete packet.how_to_write.openviking_author_guidance
  return packet
}
