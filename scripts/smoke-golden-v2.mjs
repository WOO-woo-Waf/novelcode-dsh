import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
  JsonlSidecarProvider,
  sidecarLaunchFromEnv,
} from "../packages/jsonl-provider/lib/index.js"
import { proposalForStoryEvent } from "../packages/memory-adapter/lib/index.js"
import {
  baselineCanonHash,
  createBranchProposalSeed,
  simulateBranch,
} from "../packages/simulation/lib/index.js"
import {
  compileBranchBlueprint,
  worldDeltaRef,
} from "../packages/blueprint-compiler/lib/index.js"
import {
  compileApprovedRevisionStateCandidates,
  revisionExcerptSha256,
} from "../packages/state-recorder/lib/index.js"

const workspace = await mkdtemp(join(tmpdir(), "novelcode-dsh-golden-"))
const coreRoot = process.env.NOVELCODE_DSH_CORE_ROOT
if (!coreRoot) {
  throw new Error("set NOVELCODE_DSH_CORE_ROOT to a readable Novel Workbench checkout")
}
const provider = new JsonlSidecarProvider({
  launch: sidecarLaunchFromEnv({
    ...process.env,
    NOVELCODE_DSH_CORE_ROOT: resolve(coreRoot),
  }),
  requestTimeoutMs: 30_000,
})

const reports = []

try {
  const beforeStart = await provider.readiness(workspace)
  if (beforeStart.running) throw new Error("sidecar started before the first request")

  const invalid = await run({ action: "narrative_invalid_golden_probe" }, false)
  if (invalid.success || !/(invalid|unknown|missing)/i.test(invalid.summary)) {
    throw new Error(`invalid action did not fail closed: ${JSON.stringify(invalid)}`)
  }
  const readiness = await provider.readiness(workspace)
  if (!readiness.running || readiness.pendingRequests !== 0) {
    throw new Error(`sidecar readiness is unhealthy: ${JSON.stringify(readiness)}`)
  }

  await run({
    action: "narrative_project_init",
    project_id: "golden-headless-v1",
    project_title: "合成金丝雀小说",
    language: "zh-CN",
  })

  const story = await run({
    action: "narrative_story_contract_propose",
    payload: {
      id: "golden-story-contract",
      core_promise: "一名档案员必须在会改变的城市记录中辨认真相。",
      protagonist: "顾岚",
      desire: "找出消失街区仍被谁记得",
      central_conflict: "每次核对记录都会让另一个可靠证据失效",
      stakes: "错误确认会抹去同伴保留的最后一段共同记忆",
      ending_direction: "主角接受不完整证据，并选择让多人的见证并存",
      genre_boundaries: ["近未来悬疑", "现实因果优先"],
      author_constraints: ["不由叙述者替读者总结人物意义"],
    },
  })
  const storyId = proposalId(story)
  await submitAndConfirm(storyId)

  const style = await run({
    action: "narrative_style_constitution_propose",
    payload: {
      id: "golden-style-constitution",
      viewpoint: "限制在顾岚当下可感知与可推断的范围。",
      cadence: "平时使用有呼吸的中长句，证据突变时才收紧。",
      diction: "具体、克制，不用抽象心理标签代替动作。",
      dialogue: "对白保留误听、回避与生活摩擦。",
      imagery: "物象必须改变判断、关系或行动成本。",
      pacing: "完成场景内的因果变化后再转场。",
      must_apply: ["让动作后果承担判断"],
      must_avoid: ["命运的齿轮", "直接命名目标情绪"],
      evidence: [],
    },
  })
  const styleId = proposalId(style)
  await submitAndConfirm(styleId)

  const mapChangeEvent = {
    id: "golden-event-map-change",
    eventType: "evidence_changed",
    lifecycle: "candidate",
    storyTime: { sequence: 1, label: "首次交叉验证" },
    narrativePosition: { chapterIndex: 1, sceneId: "archive", order: 1 },
    validity: { fromSequence: 1 },
    participants: ["顾岚", "沈拓"],
    causes: [],
    effects: [{ entityId: "map-seven-dock", fieldPath: "coastline", operation: "set", next: "divergent" }],
    evidence: [{ sourceId: "synthetic-golden", revisionHash: "fixture-v1", locator: "scene-archive" }],
    recordedAt: "2026-08-21T00:00:00Z",
  }
  const memoryEvent = await run(proposalForStoryEvent(mapChangeEvent))
  const memoryEventId = proposalId(memoryEvent)
  await submitAndConfirm(memoryEventId)

  const baselineEvents = [{ ...mapChangeEvent, lifecycle: "confirmed" }]
  const baselineHash = baselineCanonHash(baselineEvents, [])
  const branchDelta = [{
    entityId: "character-gulan",
    fieldPath: "evidenceArchive",
    operation: "set",
    next: "offline-sealed",
  }]
  const branch = {
    id: "golden-branch-offline-seal",
    baselineCanonHash: baselineHash,
    status: "sandbox",
    hypothesis: "顾岚在地图换手后建立离线证据封存。",
    candidateEventIds: ["golden-candidate-offline-seal"],
    stateDelta: branchDelta,
    costs: ["顾岚向搭档暴露了独立调查意图"],
    conflicts: [],
    foreshadowImpacts: ["七码头线索开启"],
  }
  const branchResult = simulateBranch({
    branch,
    baselineEvents,
    baselineKnowledge: [],
    candidateEvents: [{
      id: "golden-candidate-offline-seal",
      eventType: "evidence_archived",
      lifecycle: "candidate",
      storyTime: { sequence: 2, label: "首次离线封存" },
      narrativePosition: { chapterIndex: 1, sceneId: "archive", segmentId: "golden-segment-01", order: 2 },
      validity: { fromSequence: 2 },
      participants: ["顾岚", "沈拓"],
      causes: ["golden-event-map-change"],
      effects: branchDelta,
      evidence: [{ sourceId: "synthetic-branch", revisionHash: "hypothesis-v1", locator: "golden-segment-01" }],
      recordedAt: "2026-08-21T00:00:00Z",
    }],
    throughSequence: 2,
  })
  const branchSeed = createBranchProposalSeed(branch, branchResult)
  const compilation = compileBranchBlueprint({
    seed: branchSeed,
    simulation: branchResult,
    currentBaselineCanonHash: baselineHash,
    chapter: {
      blueprintId: "golden-chapter-001",
      title: "不存在的七码头",
      chapterIndex: 1,
      chapterFunction: "建立记录会变化的规则，并让主角第一次主动保存交叉证据。",
      entryState: "顾岚相信城市档案只存在录入错误。",
      exitState: "顾岚确认七码头同时存在于两份互相排斥的见证中。",
      requiredChanges: ["主角建立离线证据封存"],
      forbiddenChanges: ["不能揭示记录变化的最终来源"],
      reveals: ["同一张地图在不同观察者手中显示不同岸线"],
      withheldInformation: ["谁能主动改变城市记录"],
      relationshipPressure: ["顾岚开始怀疑搭档隐瞒了旧见证"],
      trackerMoves: ["七码头线索开启"],
      targetChars: 120,
      minChars: 80,
      segments: [{
        segmentId: "golden-segment-01",
        title: "岸线差异",
        goal: "让顾岚完成第一次双人交叉验证并留下离线证据。",
        entryState: "两人认为地图版本不同。",
        exitState: "两张地图在交换持有人后同时改变。",
        requiredChanges: ["形成可追踪的证据封存"],
        forbiddenChanges: ["不解释异常机制"],
        worldDeltaRefs: [worldDeltaRef(branchDelta[0])],
        sceneMode: "investigation",
        eventFunction: "rule_revelation",
        pov: "顾岚",
        narrator: "third_person_limited",
        participants: ["顾岚", "沈拓"],
        relationshipPattern: "fragile_trust",
        informationState: {
          readerKnows: ["两张地图岸线不同"],
          povKnows: ["交换地图会触发变化"],
          withheld: ["变化是否由观察者造成"],
        },
        pressureCurve: "steady_then_spike",
        intendedReaderEffects: ["unease", "curiosity"],
        representationNeeds: ["micro_action", "spatial_evidence"],
        targetChars: 120,
        minChars: 80,
      }],
    },
  })
  const branchProvenance = await run(compilation.provenanceProposal)
  const branchProvenanceId = proposalId(branchProvenance)
  const blueprint = await run(compilation.blueprintProposal)
  const blueprintId = proposalId(blueprint)
  await run({ action: "narrative_memory_submit_review", payload: { proposal_id: blueprintId } })
  await run({
    action: "narrative_blueprint_confirm",
    payload: { proposal_id: blueprintId, confirmation: "author_confirmed" },
  })

  const prepared = await run({
    action: "narrative_writing_prepare",
    payload: { blueprint_id: "golden-chapter-001" },
  })
  const preparedPayload = objectValue(prepared.payload, "writing prepare payload")
  const segments = arrayValue(preparedPayload.segments, "writing prepare segments")
  if (segments.length !== 1) throw new Error(`expected one prepared segment, got ${segments.length}`)
  const manifestPath = stringValue(preparedPayload.manifest_path, "manifest_path")
  const draftPath = "golden-synthetic-draft.txt"
  const draftText = "顾岚把两张地图并排压在冷光灯下，先让沈拓说出各自看见的岸线，再交换持有人。纸面上的七码头同时向东偏移，她没有解释，只取出离线相机、日期戳和封口袋，把两次影像分别编号。沈拓伸手时，她先合上档案盒，要求他在封条上签名；这一步让两人的怀疑第一次留下了可以追踪的成本。"
  await writeFile(join(workspace, draftPath), `${draftText}\n`, "utf8")
  await run({
    action: "narrative_segment_record",
    payload: { manifest_path: manifestPath, segment_id: "golden-segment-01", source_path: draftPath },
  })
  await run({
    action: "narrative_segment_handoff",
    payload: {
      manifest_path: manifestPath,
      segment_id: "golden-segment-01",
      summary: "地图换手后岸线同时改变，顾岚建立离线封存。",
      exit_state: "形成带签名与日期戳的离线证据。",
      knowledge_changes: ["沈拓知道顾岚已建立独立封存"],
      unresolved_pressure: ["记录由谁主动改写仍未知"],
    },
  })
  await run({ action: "narrative_evaluate", payload: { manifest_path: manifestPath } })
  const approved = await run({
    action: "narrative_chapter_approve",
    payload: { manifest_path: manifestPath, confirmation: "author_confirmed" },
  })
  const approvedPayload = objectValue(approved.payload, "approved chapter payload")
  const approvedRevisionPath = stringValue(approvedPayload.export_path, "approved export_path")
  const approvedRevisionHash = stringValue(approvedPayload.content_sha256, "approved content_sha256")
  const approvedText = await readFile(join(workspace, approvedRevisionPath), "utf8")
  const chapterEvidence = {
    chapterIndex: 1,
    segmentId: "golden-segment-01",
    startLine: 3,
    endLine: 3,
    excerptSha256: revisionExcerptSha256(approvedText, 3, 3),
  }
  const stateCompilation = await compileApprovedRevisionStateCandidates({
    workspaceRoot: workspace,
    manifestPath,
    approvedRevisionPath,
    approvedContentSha256: approvedRevisionHash,
    throughStorySequence: 2,
    storyEvents: [{
      locator: chapterEvidence,
      candidate: {
        id: "golden-approved-event-offline-seal",
        eventType: "evidence_archived",
        storyTime: { sequence: 2, label: "批准正文中的首次离线封存" },
        narrativePosition: { chapterIndex: 1, sceneId: "archive", segmentId: "golden-segment-01", order: 2 },
        validity: { fromSequence: 2 },
        participants: ["顾岚", "沈拓"],
        causes: ["golden-event-map-change"],
        effects: branchDelta,
        recordedAt: "2026-08-21T00:00:00Z",
      },
    }],
    knowledgeClaims: [{
      locator: chapterEvidence,
      candidate: {
        id: "golden-approved-knowledge-shentuo-seal",
        claimId: "gulan-created-offline-seal",
        subjectId: "沈拓",
        stance: "knows",
        confidence: 1,
        acquiredAt: { sequence: 2 },
        visibilityScope: ["沈拓"],
        sourceEventId: "golden-approved-event-offline-seal",
      },
    }],
    foreshadowDebts: [{
      locator: chapterEvidence,
      candidate: {
        id: "golden-approved-foreshadow-record-editor",
        status: "reinforced",
        plantedAt: { chapterIndex: 1, sceneId: "archive", segmentId: "golden-segment-01", order: 2 },
        targetWindow: { earliestChapter: 4, latestChapter: 8 },
        relatedEntities: ["map-seven-dock"],
        intendedReaderEffects: ["怀疑记录存在主动改写者"],
      },
    }],
  })
  const stateCandidateIds = []
  for (const proposal of stateCompilation.proposals) {
    stateCandidateIds.push(proposalId(await run(proposal)))
  }

  process.stdout.write(`${JSON.stringify({
    transport: "ready",
    workflow: "golden-headless-v1",
    workspace: "temporary-cleaned-after-run",
    proposals: {
      story: storyId,
      style: styleId,
      memoryEvent: memoryEventId,
      branchProvenance: branchProvenanceId,
      blueprint: blueprintId,
      stateCandidates: stateCandidateIds,
    },
    branch: { id: branch.id, viable: branchResult.viable, baselineHash },
    writing: {
      manifestPath,
      segments: segments.length,
      approvedRevisionPath,
      approvedRevisionHash,
    },
    reports,
  })}\n`)
} finally {
  provider.close()
  await rm(workspace, { recursive: true, force: true })
}

async function submitAndConfirm(id) {
  await run({ action: "narrative_memory_submit_review", payload: { proposal_id: id } })
  await run({
    action: "narrative_memory_confirm",
    payload: { proposal_id: id, confirmation: "author_confirmed" },
  })
}

async function run(request, expectedSuccess = true) {
  const result = await provider.execute(request, { workspace })
  if (result.success !== expectedSuccess) {
    throw new Error(`${request.action} success=${result.success}: ${result.summary}`)
  }
  reports.push({
    action: request.action,
    success: result.success,
    artifacts: result.artifacts.length,
    metricKeys: Object.keys(result.metrics).sort(),
  })
  return result
}

function proposalId(result) {
  return stringValue(objectValue(result.payload, "proposal payload").proposal_id, "proposal_id")
}

function objectValue(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value
}

function arrayValue(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value
}

function stringValue(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`)
  return value
}
