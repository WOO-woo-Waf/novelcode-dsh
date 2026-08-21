import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { resolveProductAssets } from "../src/assets.js"

describe("NovelCode DSH packaged product assets", () => {
  it("exposes the preset and native DSH fiction skills", async () => {
    const assets = resolveProductAssets()
    expect(JSON.parse(await readFile(assets.webPluginPackage, "utf8"))).toMatchObject({
      name: "@novelcode-dsh/web",
      dsh: { client: { platform: "web" } },
    })
    expect(await readFile(assets.preset, "utf8")).toContain("NovelCode 小说导演")
    expect(await readFile(join(assets.skillsDirectory, "plot-simulation", "SKILL.md"), "utf8"))
      .toContain("name: plot-simulation")
    expect(await readFile(join(assets.skillsDirectory, "state-recorder", "SKILL.md"), "utf8"))
      .toContain("name: state-recorder")
  })
})
