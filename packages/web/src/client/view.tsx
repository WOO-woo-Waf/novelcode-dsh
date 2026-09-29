import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react"
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots"
import type {} from "@deepseek-ai/dsh-client-ui-layout/client"
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client"
import type { NovelWorkbenchSnapshot } from "../types.js"
import {
  WORKBENCH_PANELS,
  type NovelWorkbenchController,
  type WorkbenchPanel,
} from "./controller.js"

export interface WorkbenchInjected {
  controller: NovelWorkbenchController
}

type TriggerProps = PropsRuntime<"sidebar.footer.action"> & WorkbenchInjected
type OverlayProps = PropsRuntime<"shell.overlay"> & WorkbenchInjected

const PANEL_LABELS: Record<WorkbenchPanel, string> = {
  project: "项目",
  sources: "素材",
  memory: "状态",
  planning: "推演",
  style: "风格",
  writing: "章节",
  versions: "版本",
}

export function NovelWorkbenchTrigger({ wide, controller }: TriggerProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  return <button
    type="button"
    className="novelcodeWorkbenchTrigger"
    aria-label="打开 NovelCode 小说工作台"
    aria-haspopup="dialog"
    aria-expanded={state.open}
    onClick={() => { void controller.open() }}
  >
    <span aria-hidden="true">✦</span>
    {wide ? <span>小说工作台</span> : undefined}
  </button>
}

export function NovelWorkbenchOverlay({ controller }: OverlayProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!state.open) return
    closeButton.current?.focus()
    const close = (event: KeyboardEvent): void => {
      if (event.key === "Escape") controller.close()
    }
    document.addEventListener("keydown", close)
    return () => { document.removeEventListener("keydown", close) }
  }, [controller, state.open])
  if (!state.open) return null
  return <aside
    className="novelcodeWorkbenchDrawer"
    role="dialog"
    aria-modal="false"
    aria-labelledby="novelcode-workbench-title"
  >
    <header className="novelcodeWorkbenchHeader">
      <div>
        <h2 id="novelcode-workbench-title">NovelCode 小说导演</h2>
        <small>{state.target?.title ?? "尚未选择小说工作区"}</small>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="novelcodeWorkbenchButton" type="button" onClick={() => { void controller.refresh() }}>刷新</button>
        <button ref={closeButton} className="novelcodeWorkbenchButton" type="button" onClick={() => { controller.close() }}>关闭</button>
      </div>
    </header>
    <nav className="novelcodeWorkbenchTabs" aria-label="小说工作面">
      {WORKBENCH_PANELS.map((panel) => <button
        key={panel}
        type="button"
        role="tab"
        className="novelcodeWorkbenchTab"
        aria-selected={state.activePanel === panel}
        onClick={() => { controller.selectPanel(panel) }}
      >{PANEL_LABELS[panel]}</button>)}
    </nav>
    <main className="novelcodeWorkbenchBody">
      <div className="novelcodeWorkbenchBanner">
        本面板只读展示 Brain、时间线、人物知情、状态投影与章节版本。所有确认、批准和终稿写入仍在 DSH 会话的原生审批卡中完成。
      </div>
      {state.status === "unbound" ? <Empty text="请选择一个已绑定 NovelCode DSH 的小说工作区。" /> : undefined}
      {state.status === "loading" ? <Empty text="正在重建可信小说状态投影…" /> : undefined}
      {state.status === "disconnected" ? <div className="novelcodeWorkbenchError">DSH Host 连接已断开，恢复后点击刷新。</div> : undefined}
      {state.status === "error" ? <div className="novelcodeWorkbenchError">{state.error ?? "工作台读取失败"}</div> : undefined}
      {state.status === "ready" && state.snapshot !== undefined
        ? <Panel snapshot={state.snapshot} panel={state.activePanel} />
        : undefined}
    </main>
  </aside>
}

function Panel({ snapshot, panel }: { snapshot: NovelWorkbenchSnapshot; panel: WorkbenchPanel }) {
  return <>
    {panel === "project" ? <ProjectPanel snapshot={snapshot} /> : undefined}
    {panel === "sources" ? <SourcesPanel snapshot={snapshot} /> : undefined}
    {panel === "memory" ? <MemoryPanel snapshot={snapshot} /> : undefined}
    {panel === "planning" ? <PlanningPanel snapshot={snapshot} /> : undefined}
    {panel === "style" ? <StylePanel snapshot={snapshot} /> : undefined}
    {panel === "writing" ? <WritingPanel snapshot={snapshot} /> : undefined}
    {panel === "versions" ? <VersionsPanel snapshot={snapshot} /> : undefined}
    {snapshot.warnings.length > 0 ? <section className="novelcodeWorkbenchSection novelcodeWorkbenchWarnings">
      <strong>诊断提示</strong><ul className="novelcodeWorkbenchList">{snapshot.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
    </section> : undefined}
  </>
}

function ProjectPanel({ snapshot }: { snapshot: NovelWorkbenchSnapshot }) {
  const project = snapshot.project
  return <>
    <MetricGrid items={[
      ["项目状态", project.status],
      ["项目 ID", project.projectId ?? "未初始化"],
      ["语言", project.language ?? "—"],
      ["GBrain 派生索引", project.derivedIndex],
    ]} />
    <Section title="作者控制边界"><SimpleTable rows={Object.entries({
      "Story Contract": project.authorGates.storyContract,
      "Style Constitution": project.authorGates.styleConstitution,
      "Active Blueprint": project.authorGates.activeBlueprint,
      "Prose Profile": project.authorGates.proseProfile,
    })} /></Section>
    <Section title="基础结构">{project.missingPaths.length === 0
      ? <p>基础路径完整。</p>
      : <ul className="novelcodeWorkbenchList">{project.missingPaths.map((path) => <li key={path}>{path}</li>)}</ul>}</Section>
  </>
}

function SourcesPanel({ snapshot }: { snapshot: NovelWorkbenchSnapshot }) {
  const sources = snapshot.sources
  return <>
    <MetricGrid items={[["已登记素材", sources.registered], ["启用素材", sources.active], ["素材文件", sources.files], ["分析 revision", sources.analysisRevisions]]} />
    <Section title="素材角色"><SimpleTable rows={Object.entries(sources.roleCounts)} empty="尚未登记素材。" /></Section>
    <Section title="分析状态"><SimpleTable rows={Object.entries(sources.analysisStatusCounts)} empty="尚未产生素材分析 revision。" /></Section>
    <Section title="OpenViking 素材与指导预览">
      <p>这里显示本地索引回执，不代表服务当前在线。正文质量仍由作者阅读判断；正式故事状态保留在 Narrative V2。</p>
      <MetricGrid items={[["已有索引回执", snapshot.openviking?.ready ?? 0], ["待处理", snapshot.openviking?.pending ?? 0]]} />
      <table className="novelcodeWorkbenchTable"><thead><tr><th>文件</th><th>用途</th><th>章节</th><th>回执</th></tr></thead><tbody>
        {(snapshot.openviking?.entries ?? []).map(entry => <tr key={`${entry.uri}:${entry.chapter ?? "all"}`}><td>{entry.path}</td><td>{({ source: "本书材料", reference: "文风参考", guidance: "作者指导" } as Record<string, string>)[entry.kind] ?? entry.kind}</td><td>{entry.chapter ?? "全书"}</td><td>{entry.state}</td></tr>)}
      </tbody></table>
      {!snapshot.openviking?.entries.length ? <Empty text="尚未导入 OpenViking。可让导演将指定文件按本书材料、文风参考或作者指导导入。" /> : undefined}
    </Section>
  </>
}

function MemoryPanel({ snapshot }: { snapshot: NovelWorkbenchSnapshot }) {
  const memory = snapshot.memory
  return <>
    <MetricGrid items={[["Memory OS", memory.status], ["Confirmed 事件", memory.events.length], ["知情声明", memory.knowledge.length], ["状态冲突", memory.state.conflicts]]} />
    <Section title="Baseline Canon Hash"><div className="novelcodeWorkbenchHash">{memory.baselineCanonHash || "尚无 confirmed Memory OS 对象"}</div></Section>
    <Section title="故事时间线"><table className="novelcodeWorkbenchTable"><thead><tr><th>序列</th><th>事件</th><th>章/场景</th><th>参与者</th><th>状态字段</th></tr></thead><tbody>
      {memory.events.map((event) => <tr key={event.id}><td>{event.sequence}</td><td>{event.eventType}<br /><small>{event.label}</small></td><td>{event.chapterIndex}/{event.sceneId ?? "—"}</td><td>{event.participants.join("、") || "—"}</td><td>{event.effectKeys.join("、") || "—"}</td></tr>)}
    </tbody></table>{memory.events.length === 0 ? <Empty text="尚无 confirmed StoryEvent。" /> : undefined}</Section>
    <Section title="人物知情矩阵"><table className="novelcodeWorkbenchTable"><thead><tr><th>人物</th><th>命题</th><th>立场</th><th>可信度</th><th>获得序列</th></tr></thead><tbody>
      {memory.knowledge.map((claim) => <tr key={claim.id}><td>{claim.subjectId}</td><td>{claim.claimId}</td><td>{claim.stance}</td><td>{claim.confidence.toFixed(2)}</td><td>{claim.acquiredAtSequence}</td></tr>)}
    </tbody></table>{memory.knowledge.length === 0 ? <Empty text="尚无 confirmed KnowledgeClaim。" /> : undefined}</Section>
    <Section title={`世界状态投影 · through ${memory.state.throughSequence}`}><table className="novelcodeWorkbenchTable"><thead><tr><th>状态键</th><th>值</th></tr></thead><tbody>
      {memory.state.values.map((item) => <tr key={item.key}><td>{item.key}</td><td>{JSON.stringify(item.value)}</td></tr>)}
    </tbody></table>{memory.state.values.length === 0 ? <Empty text="当前没有可投影的状态变化。" /> : undefined}</Section>
  </>
}

function PlanningPanel({ snapshot }: { snapshot: NovelWorkbenchSnapshot }) {
  return <>
    <MetricGrid items={[["Blueprint 页面", snapshot.planning.blueprintPages], ["Confirmed Blueprint", snapshot.planning.confirmedBlueprints], ["Branch 页面", snapshot.planning.branchPages], ["待审规划", snapshot.planning.pendingPages]]} />
    <Section title="推演边界"><p>候选分支保持在 sandbox。只有 viable branch 才能生成 provenance 与 Blueprint proposal，且晋升边界始终为 <code>proposal_only</code>。</p></Section>
  </>
}

function StylePanel({ snapshot }: { snapshot: NovelWorkbenchSnapshot }) {
  return <>
    <MetricGrid items={[["Craft 页面", snapshot.style.craftPages], ["Confirmed Craft", snapshot.style.confirmedPages], ["待审 Craft", snapshot.style.pendingPages], ["修订偏好", snapshot.style.revisionPreferencePages]]} />
    <Section title="风格基础"><SimpleTable rows={[["Style Constitution", snapshot.project.authorGates.styleConstitution], ["Prose Profile", snapshot.project.authorGates.proseProfile]]} /></Section>
    <Section title="产品约束"><p>风格规则必须保留条件、证据、反例与读者效果；单次修改只形成 observation，不自动升级为长期规则。</p></Section>
  </>
}

function WritingPanel({ snapshot }: { snapshot: NovelWorkbenchSnapshot }) {
  return <>
    <MetricGrid items={Object.entries(snapshot.writing.statusCounts)} />
    <Section title="章节运行"><table className="novelcodeWorkbenchTable"><thead><tr><th>章节</th><th>Run</th><th>状态</th><th>Segment</th><th>更新时间</th></tr></thead><tbody>
      {snapshot.writing.runs.map((run) => <tr key={run.runId}><td>{run.chapterIndex} · {run.chapterTitle}</td><td>{run.runId}</td><td>{run.status}</td><td>{run.recordedSegments}/{run.segments}{run.shortSegments > 0 ? `（短 ${run.shortSegments}）` : ""}</td><td>{run.updatedAt}</td></tr>)}
    </tbody></table>{snapshot.writing.runs.length === 0 ? <Empty text="尚未准备章节 writing run。" /> : undefined}</Section>
  </>
}

function VersionsPanel({ snapshot }: { snapshot: NovelWorkbenchSnapshot }) {
  return <>
    <MetricGrid items={[["批准 revision", snapshot.versions.approvedRevisions], ["终稿活动章节", snapshot.versions.activeFinalChapters], ["Ledger 条目", snapshot.versions.finalEntries.length]]} />
    <Section title="Final Ledger"><table className="novelcodeWorkbenchTable"><thead><tr><th>章节</th><th>Revision</th><th>Hash</th><th>活动</th></tr></thead><tbody>
      {snapshot.versions.finalEntries.map((entry) => <tr key={`${entry.chapterIndex}:${entry.hash}`}><td>{entry.chapterIndex}</td><td>{entry.revision}</td><td className="novelcodeWorkbenchHash">{entry.hash}</td><td>{entry.active ? "是" : "否"}</td></tr>)}
    </tbody></table>{snapshot.versions.finalEntries.length === 0 ? <Empty text="尚未向终稿 ledger 汇入批准章节。" /> : undefined}</Section>
  </>
}

function MetricGrid({ items }: { items: ReadonlyArray<readonly [string, string | number]> }) {
  return <div className="novelcodeWorkbenchGrid">{items.map(([label, value]) => <div className="novelcodeWorkbenchMetric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="novelcodeWorkbenchSection"><h3>{title}</h3>{children}</section>
}

function SimpleTable({ rows, empty = "暂无数据。" }: { rows: ReadonlyArray<readonly [string, string | number]>; empty?: string }) {
  if (rows.length === 0) return <Empty text={empty} />
  return <table className="novelcodeWorkbenchTable"><tbody>{rows.map(([label, value]) => <tr key={label}><th>{label}</th><td>{value}</td></tr>)}</tbody></table>
}

function Empty({ text }: { text: string }) {
  return <div className="novelcodeWorkbenchEmpty">{text}</div>
}
