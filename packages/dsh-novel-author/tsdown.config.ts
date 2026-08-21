import { defineConfig } from "tsdown"

const externals = [
  "@deepseek-ai/cordis",
  "@deepseek-ai/schemastery",
  "@deepseek-ai/dsh-session",
  "@deepseek-ai/dsh-system-prompt",
  "@deepseek-ai/dsh-tools",
]

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "lib",
  format: ["esm"],
  platform: "node",
  target: "node22",
  fixedExtension: false,
  dts: false,
  clean: true,
  deps: {
    neverBundle: externals,
    alwaysBundle: (id: string) => id.startsWith("@novelcode-dsh/"),
  },
  outputOptions: {
    codeSplitting: false,
  },
})
