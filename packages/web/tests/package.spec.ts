import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("NovelCode workbench package contract", () => {
  it("declares the alpha.2 Web controller bundles and no model-facing tools", async () => {
    const root = join(import.meta.dirname, "..")
    const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as Record<string, unknown>
    const dsh = manifest.dsh as { client?: { platform?: string; inject?: string[] } }
    expect(dsh.client?.platform).toBe("web")
    expect(dsh.client?.inject).toContain("@deepseek-ai/dsh-api-session-controller")
    expect(dsh.client?.inject).toContain("@deepseek-ai/dsh-api-workspace-controller")
    expect(JSON.stringify(manifest)).not.toContain("0.1.0-rc.8")
    expect(JSON.stringify(manifest)).not.toContain("narrative_tool")
    expect(await readFile(join(root, "cordis.patch.yml"), "utf8")).toContain("@novelcode-dsh/web")
  })
})
