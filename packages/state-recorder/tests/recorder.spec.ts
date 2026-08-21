import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  compileApprovedRevisionStateCandidates,
  revisionExcerptSha256,
  type ApprovedRevisionStateInput,
} from "../src/index.js"

const approvedText = "第2章 地图换手\n\n顾岚将两张地图交换位置，岸线同时改变。\n沈拓看见她封存了纸本证据。\n"
let workspace = ""
let approvedHash = ""

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "novelcode-state-recorder-"))
  approvedHash = sha256(approvedText)
  await mkdir(join(workspace, ".narrative/runs/run-2"), { recursive: true })
  await mkdir(join(workspace, ".narrative/exports/chapters/chapter-002"), { recursive: true })
  await writeFile(join(workspace, revisionPath()), approvedText, "utf8")
  await writeFile(join(workspace, manifestPath()), `${JSON.stringify({
    schema: "novelcode-writing-run-v2",
    run_id: "run-2",
    project_id: "synthetic",
    blueprint_id: "chapter-002",
    chapter_index: 2,
    chapter_title: "地图换手",
    status: "approved",
    target_chars: 40,
    min_chars: 20,
    created_at: "2026-08-21T00:00:00Z",
    updated_at: "2026-08-21T00:00:00Z",
    approved_export_path: revisionPath(),
    approved_revision_id: "run-2-revision-a",
    approved_content_sha256: approvedHash,
    segments: [{ segment_id: "segment-01" }],
  }, null, 2)}\n`, "utf8")
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
})

describe("approved revision state recorder", () => {
  it("binds state candidates to the approved revision and emits proposal-only requests", async () => {
    const result = await compileApprovedRevisionStateCandidates(validInput())

    expect(result).toMatchObject({
      schema: "novelcode-approved-revision-state-candidates-v1",
      revisionId: "run-2-revision-a",
      revisionHash: approvedHash,
      chapterIndex: 2,
    })
    expect(result.proposals).toHaveLength(3)
    expect(result.proposals.map((proposal) => proposal.action)).toEqual([
      "narrative_memory_propose",
      "narrative_memory_propose",
      "narrative_memory_propose",
    ])
    expect(result.proposals[0]?.payload.evidence[0]).toContain(`run-2-revision-a@${approvedHash}#chapter:002/segment:segment-01/lines:3-3/`)
    expect(result.proposals[1]?.payload.data).toMatchObject({
      memory_os_schema: "knowledge-claim/v1",
      subject_id: "character-b",
      acquired_at: { sequence: 2 },
    })
    expect(JSON.stringify(result)).not.toContain("author_confirmed")
  })

  it("rejects tampered revisions and mismatched expected hashes", async () => {
    const wrongExpected = validInput()
    wrongExpected.approvedContentSha256 = "0".repeat(64)
    await expect(compileApprovedRevisionStateCandidates(wrongExpected)).rejects.toThrow(/does not match the manifest/)

    await writeFile(join(workspace, revisionPath()), `${approvedText}篡改`, "utf8")
    await expect(compileApprovedRevisionStateCandidates(validInput())).rejects.toThrow(/content hash mismatch/)
  })

  it("rejects locator gaps, unknown segments, and evidence-free batches", async () => {
    const outOfBounds = validInput()
    outOfBounds.storyEvents![0]!.locator.endLine = 99
    await expect(compileApprovedRevisionStateCandidates(outOfBounds)).rejects.toThrow(/out of bounds/)

    const unknownSegment = validInput()
    unknownSegment.storyEvents![0]!.locator.segmentId = "segment-missing"
    await expect(compileApprovedRevisionStateCandidates(unknownSegment)).rejects.toThrow(/unknown segment/)

    const empty = validInput()
    empty.storyEvents = []
    empty.knowledgeClaims = []
    empty.foreshadowDebts = []
    await expect(compileApprovedRevisionStateCandidates(empty)).rejects.toThrow(/at least one evidence-bound/)
  })

  it("rejects character knowledge acquired before its source event or beyond the chapter boundary", async () => {
    const beforeSource = validInput()
    beforeSource.knowledgeClaims![0]!.candidate.acquiredAt.sequence = 1
    await expect(compileApprovedRevisionStateCandidates(beforeSource)).rejects.toThrow(/invalid acquisition time/)

    const afterBoundary = validInput()
    afterBoundary.knowledgeClaims![0]!.candidate.acquiredAt.sequence = 3
    await expect(compileApprovedRevisionStateCandidates(afterBoundary)).rejects.toThrow(/invalid acquisition time/)
  })
})

function validInput(): ApprovedRevisionStateInput {
  const eventLocator = {
    chapterIndex: 2,
    segmentId: "segment-01",
    startLine: 3,
    endLine: 3,
    excerptSha256: revisionExcerptSha256(approvedText, 3, 3),
  }
  const witnessLocator = {
    chapterIndex: 2,
    segmentId: "segment-01",
    startLine: 4,
    endLine: 4,
    excerptSha256: revisionExcerptSha256(approvedText, 4, 4),
  }
  return {
    workspaceRoot: workspace,
    manifestPath: manifestPath(),
    approvedRevisionPath: revisionPath(),
    approvedContentSha256: approvedHash,
    throughStorySequence: 2,
    storyEvents: [{
      locator: eventLocator,
      candidate: {
        id: "event-map-swap",
        eventType: "evidence_changed",
        storyTime: { sequence: 2 },
        narrativePosition: { chapterIndex: 2, segmentId: "segment-01", order: 1 },
        validity: { fromSequence: 2 },
        participants: ["character-a", "character-b"],
        causes: ["event-map-found"],
        effects: [{
          entityId: "map-seven-dock",
          fieldPath: "coastline",
          operation: "set",
          previous: "stable",
          next: "divergent",
        }],
        recordedAt: "2026-08-21T00:00:00Z",
      },
    }],
    knowledgeClaims: [{
      locator: witnessLocator,
      candidate: {
        id: "knowledge-witnessed-seal",
        claimId: "character-a-sealed-paper-evidence",
        subjectId: "character-b",
        stance: "knows",
        confidence: 1,
        acquiredAt: { sequence: 2 },
        visibilityScope: ["character-b"],
        sourceEventId: "event-map-swap",
      },
    }],
    foreshadowDebts: [{
      locator: eventLocator,
      candidate: {
        id: "foreshadow-record-editor",
        status: "reinforced",
        plantedAt: { chapterIndex: 1, order: 1 },
        targetWindow: { earliestChapter: 5, latestChapter: 8 },
        relatedEntities: ["map-seven-dock"],
        intendedReaderEffects: ["怀疑记录存在主动改写者"],
      },
    }],
  }
}

function manifestPath(): string {
  return ".narrative/runs/run-2/manifest.json"
}

function revisionPath(): string {
  return ".narrative/exports/chapters/chapter-002/run-2-revision-a.txt"
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}
