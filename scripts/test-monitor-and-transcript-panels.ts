/**
 * test-monitor-and-transcript-panels.ts — Tests for Monitor and Meeting Transcript Panels.
 *
 * Task 9.14 of OpenSpec bunker-virtual-office change.
 *
 * Verifies:
 * 1. Bounded read-only logs (MAX_LOG_LINES = 100, clamping to latest lines with notice).
 * 2. Read-only invariants on monitor logs.
 * 3. Real mode labels (a2a agent protocol vs simulasi gateway LLM).
 * 4. Failed turn highlighting, preservation and formatting (never dropped or hidden).
 * 5. Bounded rendered turns for UI responsiveness on desktop/mobile.
 *
 * Run: npx tsx scripts/test-monitor-and-transcript-panels.ts
 */

import {
  MAX_LOG_LINES,
  MAX_RENDERED_TURNS,
  formatBoundedLog,
  getMeetingModeInfo,
  isFailedTurn,
  formatTurnError,
  boundTurns,
} from '../src/lib/office/monitor-transcript'

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
  console.log('\n--- Monitor and Meeting Transcript Panels Tests (Task 9.14) ---\n')

  // ---------------------------------------------------------------------------
  // 1. Bounded Log Slicing
  // ---------------------------------------------------------------------------
  console.log('1. Bounded Read-Only Logs:')
  {
    // Under limit
    const smallLog = Array.from({ length: 45 }, (_, i) => `Line ${i + 1}`).join('\n')
    const smallRes = formatBoundedLog(smallLog)
    assert('Small log (45 lines) totalLines is 45', smallRes.totalLines === 45)
    assert('Small log displayedLines is 45', smallRes.displayedLines === 45)
    assert('Small log isTruncated is false', smallRes.isTruncated === false)
    assert('Small log notice is null', smallRes.notice === null)
    assert('Small log isReadOnly is true', smallRes.isReadOnly === true)
    assert('Small log first line is Line 1', smallRes.clampedLines[0] === 'Line 1')
    assert('Small log last line is Line 45', smallRes.clampedLines[44] === 'Line 45')

    // Over limit: 200 lines clamped to 100
    const largeLog = Array.from({ length: 200 }, (_, i) => `Log entry ${i + 1}`).join('\n')
    const largeRes = formatBoundedLog(largeLog)
    assert('Large log (200 lines) totalLines is 200', largeRes.totalLines === 200)
    assert('Large log displayedLines is 100', largeRes.displayedLines === MAX_LOG_LINES)
    assert('Large log isTruncated is true', largeRes.isTruncated === true)
    assert('Large log isReadOnly is true', largeRes.isReadOnly === true)
    assert(
      'Large log notice matches expected format',
      largeRes.notice === '[Menampilkan 100 baris terakhir dari 200 baris]',
      largeRes.notice || ''
    )
    assert(
      'Large log displayText contains notice header',
      largeRes.text.startsWith('[Menampilkan 100 baris terakhir dari 200 baris]')
    )
    assert(
      'Large log clampedLines has exactly 100 lines',
      largeRes.clampedLines.length === 100
    )
    assert(
      'Large log starts with line 101 (latest 100 retained)',
      largeRes.clampedLines[0] === 'Log entry 101'
    )
    assert(
      'Large log ends with line 200',
      largeRes.clampedLines[99] === 'Log entry 200'
    )

    // Empty / null handling
    const emptyRes = formatBoundedLog('')
    assert('Empty log totalLines is 0', emptyRes.totalLines === 0)
    assert('Empty log isReadOnly is true', emptyRes.isReadOnly === true)
  }

  // ---------------------------------------------------------------------------
  // 2. Real Mode Labels
  // ---------------------------------------------------------------------------
  console.log('\n2. Real Mode Labels (Simulasi vs A2A):')
  {
    // A2A mode
    const a2aInfo = getMeetingModeInfo('a2a')
    assert('a2a isSynthetic is false', a2aInfo.isSynthetic === false)
    assert(
      'a2a shortBadge contains "A2A (Agent Nyata)"',
      a2aInfo.shortBadge === 'A2A (Agent Nyata)'
    )
    assert(
      'a2a fullLabel is "Protokol Agent Nyata (A2A)"',
      a2aInfo.fullLabel === 'Protokol Agent Nyata (A2A)'
    )

    // Simulasi mode
    const simInfo = getMeetingModeInfo('simulasi')
    assert('simulasi isSynthetic is true', simInfo.isSynthetic === true)
    assert(
      'simulasi shortBadge is "SIMULASI (Gateway LLM)"',
      simInfo.shortBadge === 'SIMULASI (Gateway LLM)'
    )
    assert(
      'simulasi fullLabel is "Simulasi LLM Gateway - bukan agen nyata"',
      simInfo.fullLabel === 'Simulasi LLM Gateway - bukan agen nyata'
    )

    // Auto (legacy alias)
    const autoInfo = getMeetingModeInfo('auto')
    assert('auto isSynthetic is true', autoInfo.isSynthetic === true)
    assert(
      'auto shortBadge is "SIMULASI (Gateway LLM)"',
      autoInfo.shortBadge === 'SIMULASI (Gateway LLM)'
    )

    // Unknown mode fails closed to synthetic
    const unkInfo = getMeetingModeInfo('mystery-mode')
    assert('unknown mode isSynthetic is true', unkInfo.isSynthetic === true)
    assert(
      'unknown mode indicates non-authentic mode',
      unkInfo.shortBadge.includes('SIMULASI')
    )
  }

  // ---------------------------------------------------------------------------
  // 3. Failed Turns Highlighting and Preservation
  // ---------------------------------------------------------------------------
  console.log('\n3. Failed Turns Highlighting and Preservation:')
  {
    // Normal successful turns
    const okTurn = { speaker: 'alex', text: 'All systems green', kind: 'speech', status: 'success' }
    assert('Normal turn is not failed', isFailedTurn(okTurn) === false)

    // Kind === 'error'
    const errorKindTurn = {
      speaker: 'maya',
      text: 'WebSocket disconnect',
      kind: 'error',
    }
    assert('Turn with kind="error" is marked failed', isFailedTurn(errorKindTurn) === true)

    // Status === 'failed'
    const failedStatusTurn = {
      speaker: 'david',
      text: 'Timeout waiting for peer',
      kind: 'speech',
      status: 'failed',
      error: 'Gateway HTTP 504',
    }
    assert('Turn with status="failed" is marked failed', isFailedTurn(failedStatusTurn) === true)
    assert(
      'Error message extracted from error field',
      formatTurnError(failedStatusTurn) === 'Gateway HTTP 504'
    )

    // Error message present
    const errObjTurn = {
      speaker: 'sarah',
      text: 'Failed attempt',
      kind: 'speech',
      error_message: 'Peer profile offline',
    }
    assert('Turn with error_message is marked failed', isFailedTurn(errObjTurn) === true)
    assert(
      'Error message extracted from error_message field',
      formatTurnError(errObjTurn) === 'Peer profile offline'
    )

    // Sequence preservation: turns before and after remain intact
    const meetingTurns = [
      { speaker: 'alex', text: 'Opening', kind: 'opening' },
      { speaker: 'david', text: 'Failed connection', kind: 'error', error: 'ECONNREFUSED' },
      { speaker: 'maya', text: 'Continuation', kind: 'speech' },
    ]
    assert('Turn sequence length preserved (3 turns)', meetingTurns.length === 3)
    assert('Turn 0 is alex opening', meetingTurns[0].speaker === 'alex' && !isFailedTurn(meetingTurns[0]))
    assert('Turn 1 is failed david turn', meetingTurns[1].speaker === 'david' && isFailedTurn(meetingTurns[1]))
    assert('Turn 2 is maya continuation', meetingTurns[2].speaker === 'maya' && !isFailedTurn(meetingTurns[2]))
  }

  // ---------------------------------------------------------------------------
  // 4. Bounded Rendered Turns
  // ---------------------------------------------------------------------------
  console.log('\n4. Bounded Rendered Turns:')
  {
    const shortTurns = Array.from({ length: 20 }, (_, i) => ({
      speaker: `Agent ${i}`,
      text: `Statement ${i}`,
      kind: 'speech',
    }))
    const shortRes = boundTurns(shortTurns)
    assert('Short turns (20) totalTurns is 20', shortRes.totalTurns === 20)
    assert('Short turns displayedTurns is 20', shortRes.displayedTurns === 20)
    assert('Short turns isTruncated is false', shortRes.isTruncated === false)
    assert('Short turns notice is null', shortRes.notice === null)

    const longTurns = Array.from({ length: 150 }, (_, i) => ({
      speaker: `Agent ${i}`,
      text: `Statement ${i}`,
      kind: 'speech',
    }))
    const longRes = boundTurns(longTurns)
    assert('Long turns (150) totalTurns is 150', longRes.totalTurns === 150)
    assert('Long turns displayedTurns is 100', longRes.displayedTurns === MAX_RENDERED_TURNS)
    assert('Long turns isTruncated is true', longRes.isTruncated === true)
    assert(
      'Long turns notice matches expected format',
      longRes.notice === '[Menampilkan 100 giliran terakhir dari 150 giliran]'
    )
    assert('Long turns first clamped turn is index 50', longRes.turns[0].speaker === 'Agent 50')
    assert('Long turns last clamped turn is index 149', longRes.turns[99].speaker === 'Agent 149')
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\nResults: ${checks - failures}/${checks} checks passed.`)
  if (failures > 0) {
    console.error(`FAILED: ${failures} check(s) failed.`)
    process.exit(1)
  } else {
    console.log('SUCCESS: All monitor and transcript panel tests passed.\n')
  }
}

runTests().catch((err) => {
  console.error('Unexpected test error:', err)
  process.exit(1)
})
