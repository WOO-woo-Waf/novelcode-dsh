import { mkdir, readFile, writeFile, symlink, lstat, readlink, cp } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn, spawnSync } from "node:child_process"
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const dshHome = join(root, "runtime", "dsh")
const profile = join(dshHome, "profiles", "novel-next")
const bin = join(root, "node_modules", ".bin", "dsh")
const args = process.argv.slice(2)
if (args.includes("--help")) {
  console.log("node scripts/start-next.mjs [--check] [--port 3088]\nSeparate DSH_HOME=runtime/dsh; OpenViking defaults to http://127.0.0.1:1938.\nSet NOVELCODE_DSH_CORE_ROOT; configure the main model in the new DSH UI.")
  process.exit(0)
}
const version = spawnSync(bin, ["--version"], { encoding: "utf8" })
if (version.status !== 0 || !version.stdout.includes("0.1.3-alpha.2")) throw new Error("Install the pinned next dependencies first: pnpm install --frozen-lockfile")
for (const name of ["dsh-novel-author","web"]) {
  await readFile(join(root,"packages",name,"lib/index.js"))
}
await mkdir(profile, { recursive: true })
const manifest = join(profile, "package.json")
const desired = { name: "novel-next-profile", private: true, dsh: { profile: { bundles: ["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app","@novelcode-dsh/novel-author","@novelcode-dsh/web"], patchReload: "startup" } } }
try { await writeFile(manifest, JSON.stringify(desired,null,2)+"\n", { flag: "wx" }) } catch(e) { if(e.code!=="EEXIST") throw e }
try { await writeFile(join(profile,"cordis.patch.yml"), "[]\n", { flag: "wx" }) } catch(e) { if(e.code!=="EEXIST") throw e }
for (const [name,folder] of [["novel-author","dsh-novel-author"],["web","web"]]) {
  const link=join(profile,"node_modules","@novelcode-dsh",name), target=join(root,"packages",folder)
  await mkdir(dirname(link),{recursive:true})
  try {
    const info=await lstat(link)
    if(!info.isSymbolicLink() || resolve(dirname(link),await readlink(link))!==target) throw new Error("Unexpected existing next plugin link: "+link)
  } catch(e) { if(e.code==="ENOENT") await symlink(target,link,"dir"); else throw e }
}
const preset = join(dshHome,".agent-presets","novel-author-next")
await mkdir(preset,{recursive:true})
for (const name of ["preset.yml","agent.cordis.yml"]) {
  const destination=join(preset,name)
  try { await lstat(destination) } catch(e) {
    if(e.code!=="ENOENT") throw e
    await cp(join(root,"packages/dsh-novel-author/presets/novel-author",name),destination)
  }
}
const env={...process.env, DSH_HOME:dshHome,
  NOVELCODE_DSH_CORE_ROOT:process.env.NOVELCODE_DSH_CORE_ROOT || "/root/dev/novel-workbench",
  NOVELCODE_OPENVIKING_URL:process.env.NOVELCODE_OPENVIKING_URL || "http://127.0.0.1:1938",
  DSH_BUNDLED_SKILL_DIR:join(root,"packages/dsh-novel-author/skills"),
}
if(args.includes("--check")) {
  const check=spawnSync(bin,["--profile","novel-next","--dump-config"],{env,cwd:root,encoding:"utf8"})
  if(check.status!==0) { process.stderr.write(check.stderr); process.exit(check.status??1) }
  if(!check.stdout.includes("@novelcode-dsh/novel-author") || !check.stdout.includes("@novelcode-dsh/web")) throw new Error("Novel bundles missing")
  console.log(JSON.stringify({version:version.stdout.trim(),dsh_home:dshHome,profile:"novel-next",bundles:"verified",openviking:env.NOVELCODE_OPENVIKING_URL}))
  process.exit(0)
}
const portAt=args.indexOf("--port")
const port=portAt<0?"3088":args[portAt+1]
if(!port || !/^\d+$/.test(port) || Number(port)>65535) throw new Error("Invalid port")
console.log("Novel next: DSH "+version.stdout.trim()+"; independent home "+dshHome)
const child=spawn(bin,["--profile","novel-next","--host","127.0.0.1","--port",port,"--no-open"],{cwd:root,env,stdio:"inherit"})
for(const signal of ["SIGINT","SIGTERM"]) process.on(signal,()=>child.kill(signal))
child.on("exit",(code,signal)=>{process.exitCode=code??(signal?1:0)})

