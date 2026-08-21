import { createRequire } from "node:module"
import { dirname, join } from "node:path"

export interface ProductAssets {
  pluginPackage: string
  webPluginPackage: string
  presetDirectory: string
  skillsDirectory: string
  preset: string
  composition: string
}

export function resolveProductAssets(): ProductAssets {
  const require = createRequire(import.meta.url)
  const pluginPackage = require.resolve("@novelcode-dsh/novel-author/package.json")
  const webPluginPackage = require.resolve("@novelcode-dsh/web/package.json")
  const presetDirectory = join(dirname(pluginPackage), "presets", "novel-author")
  return {
    pluginPackage,
    webPluginPackage,
    presetDirectory,
    skillsDirectory: join(dirname(pluginPackage), "skills"),
    preset: join(presetDirectory, "preset.yml"),
    composition: join(presetDirectory, "agent.cordis.yml"),
  }
}
