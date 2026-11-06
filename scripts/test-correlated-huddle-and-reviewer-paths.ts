/**
 * Test Correlated Huddles & Reviewer-to-Owner Paths — Task 9.10
 *
 * Verifies:
 * 1. Correlated-huddle fixtures:
 *    - Two agents speaking within 2s without correlation ID -> classified strictly as `inferred_activity`, NOT collaboration.
 *    - Two agents with shared correlation ID -> classified as `verified_collaboration`.
 *    - Two agents with shared task handoff -> classified as `verified_collaboration`.
 *    - Two agents speaking 30s apart without correlation ID -> no huddle.
 * 2. Reviewer-to-owner path fixtures:
 *    - Reviewer Auditoria (desk 1) reviewing Centinela's task (owner Centinela, desk 0) -> target is Desk 0 visitor spot (NOT desk 1!).
 *    - Reviewer Radar (desk 4) reviewing Pulso's task (owner Pulso, desk 3) -> target is Desk 3 visitor spot.
 *    - Reviewer facing direction faces owner's desk center.
 *    - Task with deskless owner -> falls back gracefully without phantom desk.
 * 3. Scene integration check:
 *    - Verify scene.ts reviewer targeting logic properly uses owner desk and visitor spot.
 *
 * Run: npx tsx scripts/test-correlated-huddle-and-reviewer-paths.ts
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import {
  classifyHuddle,
  resolveReviewerTarget,
  type HuddleEvent,
  type CorrelatedHuddle,
} from '../src/lib/office/huddle'
import {
  DESKS,
  deskByIndex,
  visitorSpot,
  deskVisitorWorld,
  type Desk,
} from '../src/lib/office/layout'

let checks = 0
let failures = 0

function assert(description: string, ok: boolean, detail?: string) {
  checks++
  if (ok) {
    console.log(`  ok    ${description}`)
  } else {
    failures++
    console.error(`  FAIL  ${description}${detail ? ` — ${detail}` : ''}`)
  }
}

async function runTests() {
  console.log('\n--- Correlated Huddle & Reviewer-to-Owner Path Tests (Task 9.10) ---\n')

  // ---------------------------------------------------------------------------
  // 1. Correlated Huddle Fixtures
  // ---------------------------------------------------------------------------
  console.log('1. Correlated Huddle Fixtures:')
  {
    // A. Two agents speaking within 2s without correlation ID -> inferred_activity (NEVER collaboration)
    const e1: HuddleEvent = {
      agent: 'Centinela',
      text: 'Firewall rules updated',
      ts: 1000,
    }
    const e2: HuddleEvent = {
      agent: 'Pulso',
      text: 'Checking exchange latency',
      ts: 2500, // 1.5s delta
    }
    const huddle1 = classifyHuddle(e1, e2, 5000)
    assert('Speech within 2s without correlation ID forms a huddle', huddle1 !== null)
    if (huddle1) {
      assert(
        'Simultaneous speech without correlation is classified strictly as inferred_activity',
        huddle1.classification === 'inferred_activity',
      )
      assert(
        'Simultaneous speech does NOT claim collaboration ID',
        huddle1.correlationId === undefined,
      )
      assert(
        'Reason states cannot claim collaboration',
        huddle1.reason.includes('cannot claim collaboration'),
      )
      assert('Participants include Centinela and Pulso', huddle1.participants.includes('Centinela') && huddle1.participants.includes('Pulso'))
    }

    // B. Two agents with shared correlation ID -> verified_collaboration
    const eCorr1: HuddleEvent = {
      agent: 'Auditoria',
      text: 'Review request for change bunker-virtual-office',
      ts: 1000,
      correlationId: 'corr-huddle-audit-42',
    }
    const eCorr2: HuddleEvent = {
      agent: 'Centinela',
      text: 'Diff submitted for inspection',
      ts: 3200,
      correlationId: 'corr-huddle-audit-42',
    }
    const huddleCorr = classifyHuddle(eCorr1, eCorr2, 5000)
    assert('Events with shared correlationId form a huddle', huddleCorr !== null)
    if (huddleCorr) {
      assert(
        'Shared correlationId yields verified_collaboration',
        huddleCorr.classification === 'verified_collaboration',
      )
      assert(
        'Preserves exact correlationId',
        huddleCorr.correlationId === 'corr-huddle-audit-42',
      )
      assert(
        'Reason reflects explicit correlation ID',
        huddleCorr.reason.includes('explicit correlation ID'),
      )
    }

    // C. Two agents with shared task handoff -> verified_collaboration
    const eTask1: HuddleEvent = {
      agent: 'Radar',
      text: 'Passing market telemetry task',
      ts: 5000,
      taskId: 'task-market-telemetry',
    }
    const eTask2: HuddleEvent = {
      agent: 'Pulso',
      text: 'Received market telemetry task',
      ts: 8000,
      taskId: 'task-market-telemetry',
    }
    const huddleTask = classifyHuddle(eTask1, eTask2, 5000)
    assert('Events with shared taskId form a huddle', huddleTask !== null)
    if (huddleTask) {
      assert(
        'Shared taskId yields verified_collaboration',
        huddleTask.classification === 'verified_collaboration',
      )
      assert(
        'Reason reflects shared task exchange',
        huddleTask.reason.includes('shared task exchange'),
      )
    }

    // D. Two agents speaking 30s apart without correlation ID -> no huddle
    const eDistant1: HuddleEvent = {
      agent: 'Centinela',
      text: 'Morning health check',
      ts: 1000,
    }
    const eDistant2: HuddleEvent = {
      agent: 'Pulso',
      text: 'Evening report',
      ts: 31000, // 30s apart
    }
    const huddleDistant = classifyHuddle(eDistant1, eDistant2, 5000)
    assert('Speech 30s apart without correlation produces no huddle (null)', huddleDistant === null)

    // E. Same agent speaking twice -> no huddle
    const eSelf1: HuddleEvent = { agent: 'Centinela', text: 'Solo note 1', ts: 1000 }
    const eSelf2: HuddleEvent = { agent: 'Centinela', text: 'Solo note 2', ts: 1500 }
    assert('Agent speaking alone does not huddle with self', classifyHuddle(eSelf1, eSelf2) === null)
  }

  // ---------------------------------------------------------------------------
  // 2. Reviewer-to-Owner Path Fixtures
  // ---------------------------------------------------------------------------
  console.log('\n2. Reviewer-to-Owner Path Fixtures:')
  {
    const roster = new Map<string, { deskIndex: number | null }>([
      ['Centinela', { deskIndex: 0 }],
      ['Auditoria', { deskIndex: 1 }],
      ['Pulso', { deskIndex: 3 }],
      ['Radar', { deskIndex: 4 }],
      ['DesklessAgent', { deskIndex: null }],
    ])

    // A. Auditoria (desk 1) reviewing Centinela's task (owner Centinela, desk 0)
    const reviewerAuditoria = { name: 'Auditoria', deskIndex: 1 }
    const taskCentinela = { id: 'task-sec-101', owner: 'Centinela' }
    const resAuditoria = resolveReviewerTarget(reviewerAuditoria, taskCentinela, roster)

    assert('Auditoria review targets Desk 0 (NOT desk 1)', resAuditoria.targetDeskIndex === 0)
    assert('Auditoria target is a visit', resAuditoria.visit === true)
    assert('Auditoria target reason is owner_desk', resAuditoria.reason === 'owner_desk')

    const desk0 = deskByIndex(0)
    assert('Desk 0 exists in layout', desk0 !== undefined)
    if (desk0) {
      const v0 = visitorSpot(desk0)
      const expectedFacing0 = Math.atan2(desk0.x - v0.x, desk0.z - v0.z)
      const world0 = deskVisitorWorld(desk0)
      assert('Visitor spot X matches deskVisitorWorld', Math.abs(v0.x - world0.x) < 0.001)
      assert('Visitor spot Z matches deskVisitorWorld', Math.abs(v0.z - world0.z) < 0.001)
      assert('Facing angle points towards desk center', Math.abs(expectedFacing0 - world0.facing) < 0.001)
    }

    // B. Radar (desk 4) reviewing Pulso's task (owner Pulso, desk 3)
    const reviewerRadar = { name: 'Radar', deskIndex: 4 }
    const taskPulso = { id: 'task-feed-202', owner: 'Pulso' }
    const resRadar = resolveReviewerTarget(reviewerRadar, taskPulso, roster)

    assert('Radar review targets Desk 3 (Pulso)', resRadar.targetDeskIndex === 3)
    assert('Radar target is a visit', resRadar.visit === true)
    assert('Radar target reason is owner_desk', resRadar.reason === 'owner_desk')

    const desk3 = deskByIndex(3)
    assert('Desk 3 exists in layout', desk3 !== undefined)
    if (desk3) {
      const v3 = visitorSpot(desk3)
      const expectedFacing3 = Math.atan2(desk3.x - v3.x, desk3.z - v3.z)
      const world3 = deskVisitorWorld(desk3)
      assert('Facing angle points towards desk 3 center', Math.abs(expectedFacing3 - world3.facing) < 0.001)
    }

    // C. Task with assignee / author fallback
    const taskAssignee = { id: 'task-assignee-test', assignee: 'Pulso' }
    const resAssignee = resolveReviewerTarget(reviewerRadar, taskAssignee, roster)
    assert('Resolves owner via task.assignee', resAssignee.targetDeskIndex === 3 && resAssignee.visit)

    const taskAuthor = { id: 'task-author-test', assignee: 'Radar', author: 'Centinela' }
    const resAuthor = resolveReviewerTarget(reviewerRadar, taskAuthor, roster)
    assert(
      'Resolves author when assignee is reviewer itself',
      resAuthor.targetDeskIndex === 0 && resAuthor.visit,
    )

    // D. Task with deskless owner -> falls back gracefully without phantom desk
    const taskDeskless = { id: 'task-deskless-test', owner: 'DesklessAgent' }
    const resDeskless = resolveReviewerTarget(reviewerAuditoria, taskDeskless, roster)
    assert(
      'Deskless owner falls back to reviewer desk (desk 1)',
      resDeskless.targetDeskIndex === 1,
    )
    assert('Deskless owner fallback is not a visit (visit: false)', resDeskless.visit === false)
    assert(
      'Deskless owner fallback reason is fallback_reviewer_desk',
      resDeskless.reason === 'fallback_reviewer_desk',
    )

    // E. Task with unknown owner -> falls back to reviewer desk
    const taskUnknown = { id: 'task-unknown-test', owner: 'NonExistentAgent' }
    const resUnknown = resolveReviewerTarget(reviewerAuditoria, taskUnknown, roster)
    assert('Unknown owner falls back to reviewer desk', resUnknown.targetDeskIndex === 1)
    assert('Unknown owner fallback visit is false', resUnknown.visit === false)
  }

  // ---------------------------------------------------------------------------
  // 3. Scene Integration Check
  // ---------------------------------------------------------------------------
  console.log('\n3. Scene Integration Check:')
  {
    const scenePath = join(__dirname, '../src/lib/office/scene.ts')
    const sceneSource = readFileSync(scenePath, 'utf8')

    // Verify scene imports resolveReviewerTarget
    assert(
      'scene.ts imports resolveReviewerTarget from ./huddle',
      sceneSource.includes("import { resolveReviewerTarget } from './huddle'"),
    )

    // Verify scene invokes resolveReviewerTarget in duty === 'review'
    assert(
      'scene.ts calls resolveReviewerTarget',
      sceneSource.includes('resolveReviewerTarget('),
    )

    // Verify scene does NOT have the old hardcoded "const desk = myDesk" in duty === 'review'
    const reviewerBlockMatch = sceneSource.match(
      /if \(duty === 'review'[\s\S]*?Math\.atan2\(desk\.x - v\.x, desk\.z - v\.z\)/,
    )
    assert('scene.ts contains duty === review branch', reviewerBlockMatch !== null)
    if (reviewerBlockMatch) {
      const block = reviewerBlockMatch[0]
      assert(
        'Reviewer branch uses visitorSpot(desk)',
        block.includes('visitorSpot(desk)'),
      )
      assert(
        'Reviewer branch does NOT hardcode "const desk = myDesk" exclusively',
        !block.includes('const desk = myDesk\n      {'),
      )
      assert(
        'Reviewer branch faces desk center',
        block.includes('Math.atan2(desk.x - v.x, desk.z - v.z)'),
      )
    }

    // Verify setTasks retains tasks for reviewer walk
    assert(
      'scene.ts setTasks retains tasksList',
      sceneSource.includes('tasksList = tasks || []'),
    )
  }

  // Summary
  if (failures > 0) {
    console.error(`\nFailed with ${failures} error(s) out of ${checks} checks.`)
    process.exit(1)
  } else {
    console.log(`\nAll ${checks} checks passed successfully.`)
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err)
  process.exit(1)
})
