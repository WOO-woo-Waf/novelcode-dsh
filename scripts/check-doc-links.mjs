import { readdir, readFile, stat } from "node:fs/promises"
import { dirname, extname, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const sources = [resolve(root, "README.md"), resolve(root, "references", "README.md")]
for (const directory of ["apps", "docs", "packages"]) {
  sources.push(...await markdownFiles(resolve(root, directory)))
}

const broken = []
let checked = 0
for (const source of sources) {
  const markdown = await readFile(source, "utf8")
  for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const raw = match[1]?.trim()
    if (!raw || /^(?:https?:|mailto:|#)/.test(raw)) continue
    const withoutTitle = raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1) : raw.split(/\s+/)[0]
    const path = decodeURIComponent(withoutTitle.split("#", 1)[0] ?? "")
    if (!path) continue
    checked += 1
    const target = resolve(dirname(source), path)
    try {
      await stat(target)
    } catch {
      broken.push(`${source.slice(root.length + 1)} -> ${raw}`)
    }
  }
}

if (broken.length > 0) {
  throw new Error(`broken local Markdown links:\n${broken.map((item) => `- ${item}`).join("\n")}`)
}
process.stdout.write(`checked ${checked} local Markdown links across ${sources.length} files\n`)

async function markdownFiles(directory) {
  const files = []
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return files
    throw error
  }
  for (const entry of entries) {
    if ([".git", "dist", "lib", "node_modules"].includes(entry.name)) continue
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await markdownFiles(path))
    else if (entry.isFile() && extname(entry.name) === ".md") files.push(path)
  }
  return files
}
