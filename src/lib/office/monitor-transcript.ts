/**
 * monitor-transcript.ts — Canonical logic for monitor logs and meeting transcripts.
 *
 * Task 9.14 of OpenSpec bunker-virtual-office change.
 *
 * Invariants:
 * - MAX_LOG_LINES = 100: monitor logs clamp to latest 100 lines with notice.
 * - MAX_RENDERED_TURNS = 100: bounds rendered turns to protect mobile rendering.
 * - Real mode labels: simulasi is synthetic gateway, a2a is authentic agent protocol.
 * - Failed turns transparency: failed turns preserved with error details and badges.
 * - Read-only monitor: monitor logs cannot be mutated by workers or scene actors.
 */

export const MAX_LOG_LINES = 100
export const MAX_RENDERED_TURNS = 100

export type BoundedLogResult = {
  text: string
  rawLines: string[]
  clampedLines: string[]
  totalLines: number
  displayedLines: number
  isTruncated: boolean
  notice: string | null
  isReadOnly: boolean
}

export type MeetingModeInfo = {
  isSynthetic: boolean
  shortBadge: string
  fullLabel: string
}

export type BoundedTurnsResult<T> = {
  turns: T[]
  totalTurns: number
  displayedTurns: number
  isTruncated: boolean
  notice: string | null
}

/**
 * Format and bound raw log text to latest MAX_LOG_LINES (100).
 */
export function formatBoundedLog(rawLog: string | null | undefined): BoundedLogResult {
  if (!rawLog || !rawLog.trim()) {
    return {
      text: '',
      rawLines: [],
      clampedLines: [],
      totalLines: 0,
      displayedLines: 0,
      isTruncated: false,
      notice: null,
      isReadOnly: true,
    }
  }

  // Normalize newlines and split
  const lines = rawLog.replace(/\r\n/g, '\n').split('\n')
  const total = lines.length

  if (total > MAX_LOG_LINES) {
    const clamped = lines.slice(-MAX_LOG_LINES)
    const notice = `[Menampilkan ${MAX_LOG_LINES} baris terakhir dari ${total} baris]`
    const combined = `${notice}\n${clamped.join('\n')}`
    return {
      text: combined,
      rawLines: lines,
      clampedLines: clamped,
      totalLines: total,
      displayedLines: MAX_LOG_LINES,
      isTruncated: true,
      notice,
      isReadOnly: true,
    }
  }

  return {
    text: rawLog,
    rawLines: lines,
    clampedLines: lines,
    totalLines: total,
    displayedLines: total,
    isTruncated: false,
    notice: null,
    isReadOnly: true,
  }
}

/**
 * Resolve meeting mode badges and authentic labels.
 */
export function getMeetingModeInfo(mode: string | null | undefined): MeetingModeInfo {
  if (!mode) {
    return {
      isSynthetic: true,
      shortBadge: 'SIMULASI (Gateway LLM)',
      fullLabel: 'Simulasi LLM Gateway - bukan agen nyata',
    }
  }

  const m = mode.trim().toLowerCase()
  if (m === 'a2a') {
    return {
      isSynthetic: false,
      shortBadge: 'A2A (Agent Nyata)',
      fullLabel: 'Protokol Agent Nyata (A2A)',
    }
  }

  if (m === 'simulasi' || m === 'auto') {
    return {
      isSynthetic: true,
      shortBadge: 'SIMULASI (Gateway LLM)',
      fullLabel: 'Simulasi LLM Gateway - bukan agen nyata',
    }
  }

  return {
    isSynthetic: true,
    shortBadge: 'SIMULASI (Mode Tidak Dikenal)',
    fullLabel: 'Simulasi LLM Gateway (Mode Tidak Dikenal)',
  }
}

/**
 * Check if a turn failed (error status, error kind, or error message).
 */
export function isFailedTurn(turn: {
  kind?: string
  status?: string
  error?: string | null
  error_message?: string | null
  errorMessage?: string | null
}): boolean {
  if (!turn) return false
  const kind = (turn.kind || '').toLowerCase()
  const status = (turn.status || '').toLowerCase()
  return (
    kind === 'error' ||
    status === 'failed' ||
    Boolean(turn.error) ||
    Boolean(turn.error_message) ||
    Boolean(turn.errorMessage)
  )
}

/**
 * Format turn error message.
 */
export function formatTurnError(turn: {
  error?: string | null
  error_message?: string | null
  errorMessage?: string | null
  text?: string
}): string {
  if (!turn) return 'Terjadi kegagalan turn'
  return (
    turn.error_message ||
    turn.errorMessage ||
    turn.error ||
    turn.text ||
    'Terjadi kegagalan pada giliran ini'
  )
}

/**
 * Bound turns rendered in UI to MAX_RENDERED_TURNS (100) to protect mobile browsers.
 */
export function boundTurns<T>(turns: T[] | null | undefined): BoundedTurnsResult<T> {
  if (!turns || turns.length === 0) {
    return {
      turns: [],
      totalTurns: 0,
      displayedTurns: 0,
      isTruncated: false,
      notice: null,
    }
  }

  const total = turns.length
  if (total > MAX_RENDERED_TURNS) {
    const clamped = turns.slice(-MAX_RENDERED_TURNS)
    const notice = `[Menampilkan ${MAX_RENDERED_TURNS} giliran terakhir dari ${total} giliran]`
    return {
      turns: clamped,
      totalTurns: total,
      displayedTurns: MAX_RENDERED_TURNS,
      isTruncated: true,
      notice,
    }
  }

  return {
    turns,
    totalTurns: total,
    displayedTurns: total,
    isTruncated: false,
    notice: null,
  }
}
