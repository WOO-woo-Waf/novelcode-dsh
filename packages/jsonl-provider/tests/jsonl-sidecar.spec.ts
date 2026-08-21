import { mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { JsonlSidecarProvider } from "../src/index.js"

const providers: JsonlSidecarProvider[] = []
const workspaces: string[] = []

afterEach(async () => {
  for (const provider of providers) provider.close()
  providers.length = 0
  await Promise.all(workspaces.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe("JsonlSidecarProvider", () => {
  it("routes requests through one workspace-scoped process", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "novelcode-dsh-"))
    workspaces.push(workspace)
    const provider = createProvider()
    providers.push(provider)

    const result = await provider.execute({
      action: "narrative_project_status",
      session_id: "session-a",
    }, { workspace })

    expect(result.success).toBe(true)
    expect(result.summary).toBe(`narrative_project_status:${await realpath(workspace)}`)
    expect(result.payload).toEqual({ session_id: "session-a" })
    expect((await provider.readiness(workspace)).running).toBe(true)
  })

  it("isolates sidecars between novel workspaces", async () => {
    const first = await mkdtemp(join(tmpdir(), "novelcode-dsh-a-"))
    const second = await mkdtemp(join(tmpdir(), "novelcode-dsh-b-"))
    workspaces.push(first, second)
    const provider = createProvider()
    providers.push(provider)

    await provider.execute({ action: "narrative_project_status" }, { workspace: first })
    await provider.execute({ action: "narrative_project_status" }, { workspace: second })

    const firstReadiness = await provider.readiness(first)
    const secondReadiness = await provider.readiness(second)
    expect(firstReadiness.pid).toBeTypeOf("number")
    expect(secondReadiness.pid).toBeTypeOf("number")
    expect(firstReadiness.pid).not.toBe(secondReadiness.pid)
  })

  it("retains bounded stderr for doctor diagnostics", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "novelcode-dsh-doctor-"))
    workspaces.push(workspace)
    const provider = createProvider()
    providers.push(provider)

    await provider.execute({ action: "narrative_project_doctor" }, { workspace })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect((await provider.readiness(workspace)).stderrTail).toContain("doctor-ready")
  })
})

function createProvider(): JsonlSidecarProvider {
  return new JsonlSidecarProvider({
    launch: {
      command: process.execPath,
      args: [join(import.meta.dirname, "fixtures/mock-service.mjs")],
    },
    requestTimeoutMs: 2_000,
  })
}
