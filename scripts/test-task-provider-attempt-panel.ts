/**
 * test-task-provider-attempt-panel.ts — Tests for Task / Provider / Attempt Panel & Canonical Read Model.
 *
 * Task 9.13 of OpenSpec bunker-virtual-office change.
 *
 * Verifies:
 * 1. Canonical read model formatting for standard tasks.
 * 2. Unrecognized status correctly classified as unknown with preserved rawSourceState.
 * 3. Unmet parent dependencies correctly classified as waiting with waitingReasons.
 * 4. Provider attribution for Hermes, Manus, Codex, Claude Code.
 * 5. Source link generation for authoritative systems.
 * 6. Dispatch confirmation gate: unconfirmed dispatch returns confirmation_required.
 * 7. Confirmed dispatch succeeds.
 * 8. Blocked execution provider cannot confirm dispatch.
 *
 * Run: npx tsx scripts/test-task-provider-attempt-panel.ts
 */

import {
  buildTaskCanonicalReadModel,
  confirmAndDispatchTask,
  normalizeProvider,
  buildSourceLinks,
  formatTaskAttempts,
  type TaskCanonicalReadModel,
  type ExecutionProvider,
} from '../src/lib/office/task-attempt'

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
  console.log('\n--- Task / Provider / Attempt Panel Tests (Task 9.13) ---\n')

  // ---------------------------------------------------------------------------
  // 1. Canonical read model formatting for standard tasks
  // ---------------------------------------------------------------------------
  console.log('1. Canonical Read Model Formatting for Standard Tasks:')
  {
    const todoModel = buildTaskCanonicalReadModel({
      id: 't-todo-1',
      title: 'Analyze Financial Ledger',
      status: 'todo',
    })
    assert('Todo task has canonicalStatus === "todo"', todoModel.canonicalStatus === 'todo')
    assert('Todo task rawSourceState preserves "todo"', todoModel.rawSourceState === 'todo')
    assert('Todo task isUnknownState is false', todoModel.isUnknownState === false)
    assert('Todo task canDispatch is true', todoModel.canDispatch === true)

    const readyModel = buildTaskCanonicalReadModel({
      id: 't-ready-1',
      title: 'Deploy Gateway Endpoint',
      status: 'ready',
    })
    assert('Ready task has canonicalStatus === "ready"', readyModel.canonicalStatus === 'ready')
    assert('Ready task canDispatch is true', readyModel.canDispatch === true)

    const runningModel = buildTaskCanonicalReadModel({
      id: 't-run-1',
      title: 'Active Synthesis',
      status: 'running',
    })
    assert('Running task has canonicalStatus === "running"', runningModel.canonicalStatus === 'running')
    assert('Running task canDispatch is false', runningModel.canDispatch === false)

    const reviewModel = buildTaskCanonicalReadModel({
      id: 't-rev-1',
      title: 'Peer Review Required',
      status: 'review',
    })
    assert('Review task has canonicalStatus === "review"', reviewModel.canonicalStatus === 'review')
    assert('Review task canDispatch is false', reviewModel.canDispatch === false)

    const doneModel = buildTaskCanonicalReadModel({
      id: 't-done-1',
      title: 'Completed Audit',
      status: 'done',
    })
    assert('Done task has canonicalStatus === "done"', doneModel.canonicalStatus === 'done')
    assert('Done task canDispatch is false', doneModel.canDispatch === false)

    const blockedModel = buildTaskCanonicalReadModel({
      id: 't-blk-1',
      title: 'Temporarily Parked',
      status: 'blocked',
    })
    assert('Blocked task has canonicalStatus === "blocked"', blockedModel.canonicalStatus === 'blocked')
    assert('Blocked task without unmet deps canDispatch is true (run lifts block)', blockedModel.canDispatch === true)
  }

  // ---------------------------------------------------------------------------
  // 2. Unrecognized status correctly classified as unknown
  // ---------------------------------------------------------------------------
  console.log('\n2. Unrecognized Status Classified as Unknown with Preserved Raw State:')
  {
    const rawUnknown = 'experimental_custom_pipeline_42'
    const unknownModel = buildTaskCanonicalReadModel({
      id: 't-unk-1',
      title: 'Mysterious Alien Task',
      status: rawUnknown,
    })
    assert('Unrecognized status maps to canonicalStatus === "unknown"', unknownModel.canonicalStatus === 'unknown')
    assert('Unrecognized status sets isUnknownState === true', unknownModel.isUnknownState === true)
    assert('Raw source state preserved verbatim', unknownModel.rawSourceState === rawUnknown)
    assert('Unknown state is NOT dispatchable (canDispatch === false)', unknownModel.canDispatch === false)

    const archivedModel = buildTaskCanonicalReadModel({
      id: 't-arch-1',
      title: 'Old Archived Task',
      status: 'archived',
    })
    assert('Archived task rawSourceState preserved', archivedModel.rawSourceState === 'archived')
    assert('Archived task cannot be dispatched', archivedModel.canDispatch === false)
  }

  // ---------------------------------------------------------------------------
  // 3. Unmet parent dependencies correctly classified as waiting
  // ---------------------------------------------------------------------------
  console.log('\n3. Unmet Parent Dependencies Classified as Waiting with Waiting Reasons:')
  {
    // A: explicit waitingReasons
    const waitingA = buildTaskCanonicalReadModel({
      id: 't-wait-1',
      title: 'Downstream Subtask',
      status: 'ready',
      waitingReasons: ['Waiting on parent task t-root-01 to finish'],
    })
    assert('Task with waitingReasons has canonicalStatus === "waiting"', waitingA.canonicalStatus === 'waiting')
    assert('Waiting reasons populated', waitingA.waitingReasons.length === 1 && waitingA.waitingReasons[0].includes('t-root-01'))
    assert('Waiting task canDispatch is false', waitingA.canDispatch === false)
    assert('Raw source state preserved as "ready"', waitingA.rawSourceState === 'ready')

    // B: unmetDependencies
    const waitingB = buildTaskCanonicalReadModel({
      id: 't-wait-2',
      title: 'Multi Dependency Task',
      status: 'todo',
      unmetDependencies: ['dep-alpha', 'dep-beta'],
    })
    assert('Task with unmetDependencies has canonicalStatus === "waiting"', waitingB.canonicalStatus === 'waiting')
    assert('Waiting reasons has 2 items', waitingB.waitingReasons.length === 2)
    assert('Waiting task canDispatch is false', waitingB.canDispatch === false)

    // C: parents array of objects
    const waitingC = buildTaskCanonicalReadModel({
      id: 't-wait-3',
      title: 'Child Task',
      status: 'ready',
      parents: [{ id: 'p-1', status: 'running' }],
    })
    assert('Unmet parent object status produces canonicalStatus === "waiting"', waitingC.canonicalStatus === 'waiting')
    assert('Parent waiting reason recorded', waitingC.waitingReasons.length === 1 && waitingC.waitingReasons[0].includes('p-1'))

    // D: parents resolved as done -> task is NOT waiting
    const clearModel = buildTaskCanonicalReadModel({
      id: 't-wait-4',
      title: 'Child Task with Completed Parent',
      status: 'ready',
      parents: [{ id: 'p-1', status: 'done' }],
    })
    assert('Completed parent allows canonicalStatus === "ready"', clearModel.canonicalStatus === 'ready')
    assert('No waiting reasons for completed parent', clearModel.waitingReasons.length === 0)
    assert('canDispatch is true when parents are resolved', clearModel.canDispatch === true)
  }

  // ---------------------------------------------------------------------------
  // 4. Provider attribution for Hermes, Manus, Codex, Claude Code
  // ---------------------------------------------------------------------------
  console.log('\n4. Provider Attribution (Hermes, Manus, Codex, Claude Code):')
  {
    const hermesModel = buildTaskCanonicalReadModel({
      id: 't-prov-1',
      title: 'Hermes Work',
      status: 'ready',
      provider: 'hermes',
    })
    assert('Attributed to hermes', hermesModel.provider === 'hermes')

    const manusModel = buildTaskCanonicalReadModel({
      id: 't-prov-2',
      title: 'Manus Work',
      status: 'ready',
      provider: 'manus',
    })
    assert('Attributed to manus', manusModel.provider === 'manus')

    const codexModel = buildTaskCanonicalReadModel({
      id: 't-prov-3',
      title: 'Codex Work',
      status: 'ready',
      metadata: { provider: 'codex' },
    })
    assert('Attributed to codex from metadata', codexModel.provider === 'codex')

    const claudeModel = buildTaskCanonicalReadModel({
      id: 't-prov-4',
      title: 'Claude Work',
      status: 'ready',
      origin: { kind: 'agent', provider: 'claude_code' },
    })
    assert('Attributed to claude_code from origin', claudeModel.provider === 'claude_code')

    const claudeHyphenModel = buildTaskCanonicalReadModel({
      id: 't-prov-5',
      title: 'Claude Hyphenated',
      status: 'ready',
      provider: 'claude-code',
    })
    assert('Attributed to claude_code with hyphen normalization', claudeHyphenModel.provider === 'claude_code')

    const unknownProvider = buildTaskCanonicalReadModel({
      id: 't-prov-6',
      title: 'Unrecognized Provider',
      status: 'ready',
      provider: 'super_exotic_bot',
    })
    assert('Unrecognized provider classified as "unknown"', unknownProvider.provider === 'unknown')
  }

  // ---------------------------------------------------------------------------
  // 5. Source link generation for authoritative systems
  // ---------------------------------------------------------------------------
  console.log('\n5. Source Link Generation for Authoritative Systems:')
  {
    const meetingTask = buildTaskCanonicalReadModel({
      id: 't-src-1',
      title: 'Meeting Minutes Action Item',
      status: 'ready',
      origin: { kind: 'meeting', ref: 'merapi-review-04' },
    })
    assert('Meeting source link generated', meetingTask.sourceLinks.some((l) => l.kind === 'meeting' && l.url.includes('merapi-review-04')))

    const cronTask = buildTaskCanonicalReadModel({
      id: 't-src-2',
      title: 'Daily Reconciliation',
      status: 'ready',
      origin: { kind: 'cron', ref: 'reconcile-crm' },
    })
    assert('Cron source link generated', cronTask.sourceLinks.some((l) => l.kind === 'cron' && l.url.includes('reconcile-crm')))

    const crmTask = buildTaskCanonicalReadModel({
      id: 't-src-3',
      title: 'Follow Up Prospect',
      status: 'ready',
      metadata: { crm_deal_id: 'deal-5544' },
    })
    assert('CRM source link generated from metadata', crmTask.sourceLinks.some((l) => l.kind === 'crm' && l.url.includes('deal-5544')))

    const ghTask = buildTaskCanonicalReadModel({
      id: 't-src-4',
      title: 'Fix issue',
      status: 'ready',
      metadata: { github_issue: 'contexia/core#89' },
    })
    assert('GitHub source link generated', ghTask.sourceLinks.some((l) => l.kind === 'github' && l.url.includes('contexia/core#89')))

    const manusTask = buildTaskCanonicalReadModel({
      id: 't-src-5',
      title: 'Research Paper Analysis',
      status: 'running',
      metadata: { manus_run_id: 'run-9901' },
    })
    assert('Manus run source link generated', manusTask.sourceLinks.some((l) => l.kind === 'manus' && l.url.includes('run-9901')))

    assert('Native Hermes task link included', meetingTask.sourceLinks.some((l) => l.kind === 'hermes' && l.url.includes('t-src-1')))
  }

  // ---------------------------------------------------------------------------
  // 6. Dispatch confirmation gate: unconfirmed dispatch returns confirmation_required
  // ---------------------------------------------------------------------------
  console.log('\n6. Dispatch Confirmation Gate (Unconfirmed Dispatch):')
  {
    const unconfirmed = confirmAndDispatchTask('task-gate-1', false, 'admin')
    assert('Unconfirmed dispatch is rejected (dispatched === false)', unconfirmed.dispatched === false)
    assert('Reason is confirmation_required', unconfirmed.reason === 'confirmation_required')
  }

  // ---------------------------------------------------------------------------
  // 7. Confirmed dispatch succeeds
  // ---------------------------------------------------------------------------
  console.log('\n7. Confirmed Dispatch Succeeds:')
  {
    const confirmed = confirmAndDispatchTask('task-gate-1', true, 'admin')
    assert('Confirmed dispatch succeeds (dispatched === true)', confirmed.dispatched === true)
    assert('No error reason returned', confirmed.reason === undefined)

    const confirmedUser = confirmAndDispatchTask('task-gate-2', true, 'operator')
    assert('Operator role can confirm dispatch', confirmedUser.dispatched === true)
  }

  // ---------------------------------------------------------------------------
  // 8. Blocked execution provider cannot confirm dispatch
  // ---------------------------------------------------------------------------
  console.log('\n8. Blocked Execution Provider Cannot Confirm Dispatch:')
  {
    const blockedProviders = ['manus', 'codex', 'claude_code', 'MANUS', 'Codex', 'claude_code']
    for (const prov of blockedProviders) {
      const res = confirmAndDispatchTask('task-gate-3', true, prov)
      assert(
        `Provider "${prov}" is blocked from confirming dispatch`,
        res.dispatched === false && res.reason === 'caller_provider_blocked',
        `got dispatched=${res.dispatched}, reason=${res.reason}`
      )
    }
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
