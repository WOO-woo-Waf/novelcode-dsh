import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { OpenVikingClient } from "@novelcode-dsh/openviking"
import { NovelContext, workspaceUri } from "../src/index.js"
const roots: string[] = []
afterEach(async () => { for (const p of roots.splice(0)) await rm(p, { recursive: true, force: true }) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "novel-ov-test-")); roots.push(root)
  await mkdir(join(root,"pack"))
  await writeFile(join(root,"source.md"), "顾岚观察地图，不知道岸线变动的原因。")
  await writeFile(join(root,"style.md"), "写人物的停顿和动作，不用抽象标签。")
  await writeFile(join(root,"guide.md"), "顾岚的心理活动通过具体观察表现。")
  const native = { schema:"novelcode-segment-instruction-v2", segment:{ title:"岸线",goal:"交换地图",pov:"顾岚",participants:["顾岚","沈拓"] },
    what_to_write:{ story_contract:{ body:"不能揭示谜底" }, confirmed_memory:[{id:"fact-1"}] },
    how_to_write:{ condition_matched_patterns:[{id:"pattern-1"}] }, continuity:{ previous_handoff_path:"previous.json" } }
  await writeFile(join(root,"pack/segment.instruction.json"),JSON.stringify(native))
  await writeFile(join(root,"pack/manifest.json"),JSON.stringify({chapter_index:1,segments:[{segment_id:"s1",instruction_path:"pack/segment.instruction.json"}]}))
  const result = { success:true,summary:"native",artifacts:[],metrics:{},payload:{manifest_path:"pack/manifest.json",segments:[]} }
  return {root,native,result}
}
function mockClient() {
  const targets: string[] = []; const contents=new Map<string,string>(); let fail=false
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url=new URL(String(input))
    const body= typeof init?.body==="string" ? JSON.parse(init.body) : {}
    let result: unknown={}
    if(url.pathname==="/health") return Response.json({healthy:true,version:"fixture"})
    if(url.pathname.endsWith("temp_upload")) result={temp_file_id:"upload"}
    else if(url.pathname==="/api/v1/resources") { targets.push(body.to); contents.set(body.to,"顾岚握住地图边缘，停了片刻。"); result={status:"success",root_uri:body.to} }
    else if(url.pathname.endsWith("/find")) {
      if(fail) return Response.json({status:"error",error:"fixture unavailable"},{status:503})
      result={resources:targets.filter(uri=>uri.startsWith(body.target_uri+"/")).map(uri=>({uri,abstract:"preview",score:1,context_type:"resource"}))}
    } else if(url.pathname.endsWith("/read")) result=contents.get(url.searchParams.get("uri")!)??""
    return Response.json({status:"ok",result})
  }
  return {client:new OpenVikingClient({endpoint:"http://fixture",fetch:fetcher as typeof fetch}),targets,fail:()=>{fail=true}}
}
describe("novel OpenViking writing bridge",()=>{
  it("supplements actual instruction files while preserving canon, craft and handoff",async()=>{
    const {root,native,result}=await fixture(); const mock=mockClient(); const context=new NovelContext(mock.client,{maxChars:50})
    await context.importFiles(root,["source.md"],"source")
    await context.importFiles(root,["style.md"],"reference")
    await context.importFiles(root,["guide.md"],"guidance")
    const enhanced=await context.enhanceWriting(root,result)
    expect(enhanced.metrics.openviking_context_hits).toBeGreaterThan(0)
    const manifest=JSON.parse(await readFile(join(root,"pack/manifest.json"),"utf8"))
    expect(manifest.segments[0].instruction_path).toContain(".openviking.json")
    const packet=JSON.parse(await readFile(join(root,manifest.segments[0].instruction_path),"utf8"))
    expect(packet.what_to_write.confirmed_memory).toEqual(native.what_to_write.confirmed_memory)
    expect(packet.how_to_write.condition_matched_patterns).toEqual(native.how_to_write.condition_matched_patterns)
    expect(packet.continuity).toEqual(native.continuity)
    expect(packet.what_to_write.openviking_source_context[0].kind).toBe("source")
    expect(packet.how_to_write.openviking_author_guidance[0].kind).toBe("guidance")
    const all=[...packet.what_to_write.openviking_source_context,...packet.how_to_write.openviking_style_references,...packet.how_to_write.openviking_author_guidance]
    expect(all.reduce((sum:number,x:any)=>sum+x.content.length,0)).toBeLessThanOrEqual(50)
    expect(JSON.parse(await readFile(join(root,"pack/segment.instruction.json"),"utf8"))).toEqual(native)
  })
  it("is content-idempotent and excludes changed sources and other chapters",async()=>{
    const {root}=await fixture();const mock=mockClient(); const context=new NovelContext(mock.client)
    await context.importFiles(root,["source.md"],"source",2)
    await context.importFiles(root,["source.md"],"source",2)
    expect(mock.targets).toHaveLength(1)
    expect(await context.recall(root,"地图","source",1)).toEqual([])
    expect(await context.recall(root,"地图","source",2)).toHaveLength(1)
    await writeFile(join(root,"source.md"),"已修改")
    expect(await context.recall(root,"地图","source",2)).toEqual([])
    expect(workspaceUri(root)).not.toEqual(workspaceUri(root+"-other"))
  })
  it("keeps native writing usable on backend failure and records degradation",async()=>{
    const {root,native,result}=await fixture();const mock=mockClient();const context=new NovelContext(mock.client)
    await context.importFiles(root,["source.md"],"source")
    mock.fail()
    const enhanced=await context.enhanceWriting(root,result)
    expect(enhanced.success).toBe(true)
    expect(enhanced.warnings?.length).toBeGreaterThan(0)
    const manifest=JSON.parse(await readFile(join(root,"pack/manifest.json"),"utf8"))
    const packet=JSON.parse(await readFile(join(root,manifest.segments[0].instruction_path),"utf8"))
    expect(packet.openviking.status).toBe("degraded")
    expect(packet.what_to_write).toEqual(native.what_to_write)
  })
  it("does not swallow cancellation",async()=>{
    const {root,result}=await fixture();const mock=mockClient();const context=new NovelContext(mock.client)
    await context.importFiles(root,["source.md"],"source")
    const controller=new AbortController();controller.abort(new Error("cancelled"))
    await expect(context.enhanceWriting(root,result,controller.signal)).rejects.toThrow("cancelled")
  })
})

