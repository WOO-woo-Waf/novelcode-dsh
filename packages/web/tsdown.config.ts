import { defineConfig } from "tsdown"
import type { UserConfig } from "tsdown"

const nodeEntry: UserConfig = {
  entry: ["src/index.ts"],
  outDir: "lib",
  format: ["esm"],
  platform: "node",
  target: "node22",
  fixedExtension: false,
  dts: false,
  clean: true,
  deps: {
    neverBundle: [
      "@deepseek-ai/cordis",
      "@deepseek-ai/dsh-client-connection",
      "@deepseek-ai/dsh-workspace",
    ],
    alwaysBundle: (id: string) => id.startsWith("@novelcode-dsh/"),
  },
  outputOptions: { codeSplitting: false },
}

const clientEntry: UserConfig = {
  entry: { client: "src/client/index.ts" },
  outDir: "lib",
  format: ["cjs"],
  platform: "browser",
  target: "es2023",
  fixedExtension: false,
  dts: false,
  clean: false,
  outputOptions: {
    codeSplitting: false,
    entryFileNames: "client.js",
    banner: "window.__ModuleLoader__.load({ id: \"@novelcode-dsh/web\", factory: (require) => {",
    footer: "return module.exports; } });",
    intro: "var module = { exports: {} }; var exports = module.exports;",
  },
}

export default defineConfig([nodeEntry, clientEntry])
