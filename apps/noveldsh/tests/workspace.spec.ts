import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NOVELCODE_DSH_WORKSPACE_MARKER, NOVELCODE_V2_PROJECT_MANIFEST } from "@novelcode-dsh/contracts"
import { afterEach, describe, expect, it } from "vitest"
import { inspectWorkspace, initializeWorkspace } from "../src/workspace.js"

const cleanup: string[] = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe("NovelCode DSH product workspace", () => {
  it("creates a deterministic marker and is idempotent", async () => {
    const workspace = await temporaryWorkspace()
    const first = await initializeWorkspace(workspace)
    const content = await readFile(join(workspace, NOVELCODE_DSH_WORKSPACE_MARKER), "utf8")
    const second = await initializeWorkspace(workspace)

    expect(first).toMatchObject({ marker: "valid", narrativeV2: false, eligible: true })
    expect(second).toEqual(first)
    expect(content).toContain('"schema": "novelcode-dsh-workspace/v1"')
  })

  it("refuses to overwrite an invalid marker", async () => {
    const workspace = await temporaryWorkspace()
    const target = join(workspace, NOVELCODE_DSH_WORKSPACE_MARKER)
    await mkdir(join(target, ".."), { recursive: true })
    await writeFile(target, "{}\n", "utf8")

    await expect(initializeWorkspace(workspace)).rejects.toThrow(/refusing to overwrite/)
  })

  it("accepts an existing V2 workspace without adding a second truth source", async () => {
    const workspace = await temporaryWorkspace()
    const manifest = join(workspace, NOVELCODE_V2_PROJECT_MANIFEST)
    await mkdir(join(manifest, ".."), { recursive: true })
    await writeFile(manifest, "{}\n", "utf8")

    await expect(inspectWorkspace(workspace)).resolves.toMatchObject({
      marker: "missing",
      narrativeV2: true,
      eligible: true,
    })
  })
})

async function temporaryWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "noveldsh-app-"))
  cleanup.push(workspace)
  return workspace
}
