/**
 * test-seven-board-columns-and-blockers.ts — Seven Native Board Columns & Blocker Differentiation Tests.
 *
 * Task 9.18 of OpenSpec bunker-virtual-office change.
 *
 * Verifies:
 * 1. Seven native Hermes board columns preserved across renderers (TODO, DIKERJAKAN, REVIEW, SELESAI, TERHAMBAT, ARSIP, STATUS LAIN).
 * 2. Raw-state labels and source providers displayed on unfamiliar tasks under STATUS LAIN.
 * 3. Archived and unknown tasks are strictly not executable (canDispatch === false).
 * 4. Human vs dependency blocker differentiation (approval offered for human decision, NOT for dependency alone).
 * 5. Looping and stale blockers correctly classified without approval actions.
 *
 * Run: npx tsx scripts/test-seven-board-columns-and-blockers.ts
 */

import {
  KANBAN_COLUMNS,
  KNOWN,
  getBlockerBadgeInfo,
  getTaskSourceLabel,
  type KanbanColumnConfig,
} from '../src/components/KanbanColumns'
import {
  buildTaskCanonicalReadModel,
  type TaskCanonicalReadModel,
} from '../src/lib/office/task-attempt'
import type { Task } from '../src/types/hermes'

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
  console.log('\n--- Seven Native Board Columns & Blocker Differentiation Tests (Task 9.18) ---\n')

  // ---------------------------------------------------------------------------
  // 1. Seven Board Columns Structure
  // ---------------------------------------------------------------------------
  console.log('1. Seven Board Columns Structure & Executable Flags:')
  {
    assert('KANBAN_COLUMNS contains exactly 7 columns', KANBAN_COLUMNS.length === 7)

    const expectedColumns = [
      { id: 'todo', labels: ['POR HACER', 'TODO'], isExecutable: true },
      { id: 'running', labels: ['EN CURSO', 'DIKERJAKAN'], isExecutable: false },
      { id: 'review', labels: ['REVISIÓN', 'REVIEW'], isExecutable: false },
      { id: 'done', labels: ['COMPLETADO', 'SELESAI'], isExecutable: false },
      { id: 'blocked', labels: ['BLOQUEADO', 'TERHAMBAT'], isExecutable: false },
      { id: 'archived', labels: ['ARCHIVADO', 'ARSIP'], isExecutable: false },
      { id: 'other', labels: ['OTRO', 'STATUS LAIN'], isExecutable: false },
    ]

    for (let i = 0; i < expectedColumns.length; i++) {
      const expected = expectedColumns[i]
      const actual = KANBAN_COLUMNS[i]
      assert(
        `Column ${i + 1} has id "${expected.id}" and matching label`,
        actual?.id === expected.id && expected.labels.includes(actual?.label),
        `got id=${actual?.id}, label=${actual?.label}`
      )
      assert(
        `Column "${actual?.label}" isExecutable === ${expected.isExecutable}`,
        actual?.isExecutable === expected.isExecutable,
        `got isExecutable=${actual?.isExecutable}`
      )
    }

    const todoCol = KANBAN_COLUMNS.find((c) => c.id === 'todo')
    assert(
      'TODO column encompasses todo, triage, ready, scheduled',
      Boolean(
        todoCol &&
        todoCol.statuses.includes('todo') &&
        todoCol.statuses.includes('triage') &&
        todoCol.statuses.includes('ready') &&
        todoCol.statuses.includes('scheduled')
      )
    )

    const archivedCol = KANBAN_COLUMNS.find((c) => c.id === 'archived')
    assert(
      'ARSIP column contains archived status',
      Boolean(archivedCol && archivedCol.statuses.includes('archived'))
    )

    const otherCol = KANBAN_COLUMNS.find((c) => c.id === 'other')
    assert(
      'STATUS LAIN column has empty predefined statuses (catches unfamiliar)',
      Boolean(otherCol && otherCol.statuses.length === 0)
    )
  }

  // ---------------------------------------------------------------------------
  // 2. Raw-state Labels for Unknown Tasks in STATUS LAIN
  // ---------------------------------------------------------------------------
  console.log('\n2. Raw-state Labels & Source Provider for STATUS LAIN:')
  {
    const alienTask: Task = {
      id: 'task-alien-99',
      title: 'Unfamiliar Agentic Pipeline Step',
      status: 'synthesizing_vectors_v3' as any,
      assignee: 'jun',
      priority: 2,
      sourceProvider: 'custom_agent',
    }

    assert(
      'Alien status is not in KNOWN statuses',
      !KNOWN.includes(alienTask.status as string)
    )

    const sourceLabel = getTaskSourceLabel(alienTask)
    assert(
      'Task source label reflects sourceProvider "custom_agent"',
      sourceLabel === 'custom_agent'
    )

    const crmAlienTask: Task = {
      id: 'task-crm-77',
      title: 'Syncing deal stage',
      status: 'pending_crm_probe' as any,
      assignee: null,
      priority: 1,
      origin: { kind: 'cron', ref: 'sync-crm' },
    }
    assert(
      'CRM cron task source label reflects origin.kind "cron"',
      getTaskSourceLabel(crmAlienTask) === 'cron'
    )

    const defaultSourceTask: Task = {
      id: 'task-hermes-1',
      title: 'Hermes manual item',
      status: 'odd_runtime_phase' as any,
      assignee: null,
      priority: 1,
    }
    assert(
      'Fallback task source label defaults to "hermes"',
      getTaskSourceLabel(defaultSourceTask) === 'hermes'
    )
  }

  // ---------------------------------------------------------------------------
  // 3. Archived and Unknown Tasks Not Executable
  // ---------------------------------------------------------------------------
  console.log('\n3. Archived and Unknown Tasks Not Executable:')
  {
    const archivedTask: Task = {
      id: 'task-archived-10',
      title: 'Old Archived Sprint Item',
      status: 'archived',
      assignee: 'alex',
      priority: 3,
    }
    const archivedModel = buildTaskCanonicalReadModel(archivedTask)
    assert(
      'Archived task canonicalStatus is "archived"',
      archivedModel.canonicalStatus === 'archived'
    )
    assert(
      'Archived task canDispatch is strictly FALSE',
      archivedModel.canDispatch === false
    )
    assert(
      'Archived task rawSourceState preserves "archived"',
      archivedModel.rawSourceState === 'archived'
    )

    const unknownTask: Task = {
      id: 'task-unknown-55',
      title: 'Unknown Foreign State',
      status: 'unrecognized_worker_state' as any,
      assignee: null,
      priority: 2,
    }
    const unknownModel = buildTaskCanonicalReadModel(unknownTask)
    assert(
      'Unknown task canonicalStatus is "unknown"',
      unknownModel.canonicalStatus === 'unknown'
    )
    assert(
      'Unknown task isUnknownState is true',
      unknownModel.isUnknownState === true
    )
    assert(
      'Unknown task canDispatch is strictly FALSE',
      unknownModel.canDispatch === false
    )
    assert(
      'Unknown task rawSourceState preserves original unrecognized string',
      unknownModel.rawSourceState === 'unrecognized_worker_state'
    )
  }

  // ---------------------------------------------------------------------------
  // 4. Human vs Dependency Blocker Differentiation
  // ---------------------------------------------------------------------------
  console.log('\n4. Human vs Dependency Blocker Differentiation:')
  {
    // A. Human Blocker via blockerKind = 'human'
    const humanTask1: Task = {
      id: 't-human-1',
      title: 'Awaiting Architecture Signoff',
      status: 'blocked',
      assignee: 'lead',
      priority: 1,
      blockerKind: 'human',
      blockerReason: 'Requires CTO architectural approval',
    }
    const humanBadge1 = getBlockerBadgeInfo(humanTask1)
    assert('Human blocker badge is present', humanBadge1 !== null)
    assert('Human blocker kind is "human"', humanBadge1?.kind === 'human')
    assert('Human blocker label is "[Menunggu Keputusan]"', humanBadge1?.label === '[Menunggu Keputusan]')
    assert('Human blocker offersApproval is TRUE', humanBadge1?.offersApproval === true)
    assert('Human blocker styling includes amber', humanBadge1?.className.includes('amber') === true)

    // B. Human Blocker via blockReason.kind = 'needs_input'
    const humanTask2: Task = {
      id: 't-human-2',
      title: 'Need Client Budget Decision',
      status: 'blocked',
      assignee: 'pm',
      priority: 1,
      blockReason: { kind: 'needs_input', reason: 'Awaiting client approval for Q3 scope' },
    }
    const humanBadge2 = getBlockerBadgeInfo(humanTask2)
    assert('needs_input maps to human blocker', humanBadge2?.kind === 'human')
    assert('needs_input offers approval action', humanBadge2?.offersApproval === true)

    // C. Dependency Blocker via blockerKind = 'dependency'
    const depTask1: Task = {
      id: 't-dep-1',
      title: 'Waiting for Upstream API Spec',
      status: 'blocked',
      assignee: 'backend',
      priority: 2,
      blockerKind: 'dependency',
      blockerReason: 'Blocked on Task #12 spec completion',
    }
    const depBadge1 = getBlockerBadgeInfo(depTask1)
    assert('Dependency blocker badge is present', depBadge1 !== null)
    assert('Dependency blocker kind is "dependency"', depBadge1?.kind === 'dependency')
    assert('Dependency blocker label is "[Tergantung Tugas Lain]"', depBadge1?.label === '[Tergantung Tugas Lain]')
    assert('Dependency blocker offersApproval is strictly FALSE', depBadge1?.offersApproval === false)
    assert('Dependency blocker styling includes slate', depBadge1?.className.includes('slate') === true)

    // D. Dependency Blocker via blockReason.kind = 'dependency'
    const depTask2: Task = {
      id: 't-dep-2',
      title: 'Waiting for Database Migration',
      status: 'blocked',
      assignee: 'devops',
      priority: 1,
      blockReason: { kind: 'dependency', reason: 'Requires migration-004 to complete' },
    }
    const depBadge2 = getBlockerBadgeInfo(depTask2)
    assert('blockReason dependency maps to dependency blocker', depBadge2?.kind === 'dependency')
    assert('blockReason dependency offersApproval is FALSE', depBadge2?.offersApproval === false)
  }

  // ---------------------------------------------------------------------------
  // 5. Looping and Stale Blocker Categorization
  // ---------------------------------------------------------------------------
  console.log('\n5. Looping and Stale Blocker Categorization:')
  {
    const loopTask: Task = {
      id: 't-loop-1',
      title: 'Cyclic Refinement Loop',
      status: 'blocked',
      assignee: 'qa',
      priority: 2,
      blockerKind: 'looping',
    }
    const loopBadge = getBlockerBadgeInfo(loopTask)
    assert('Looping badge is present', loopBadge !== null)
    assert('Looping kind is "looping"', loopBadge?.kind === 'looping')
    assert('Looping label is "[Looping]"', loopBadge?.label === '[Looping]')
    assert('Looping offersApproval is strictly FALSE', loopBadge?.offersApproval === false)

    const staleTask: Task = {
      id: 't-stale-1',
      title: 'Unattended Worker Thread',
      status: 'blocked',
      assignee: 'worker-3',
      priority: 3,
      blockerKind: 'stale',
    }
    const staleBadge = getBlockerBadgeInfo(staleTask)
    assert('Stale badge is present', staleBadge !== null)
    assert('Stale kind is "stale"', staleBadge?.kind === 'stale')
    assert('Stale label is "[Macet]"', staleBadge?.label === '[Macet]')
    assert('Stale offersApproval is strictly FALSE', staleBadge?.offersApproval === false)
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\nResults: ${checks} checks, ${failures} failures\n`)
  if (failures > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Unhandled test failure:', err)
  process.exit(1)
})
