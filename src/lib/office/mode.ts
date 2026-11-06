/**
 * Office Mode & Demo Isolation Boundary (Task 9.1)
 *
 * Implements mode boundaries:
 * - 'demo': Isolated fixture demo mode; cannot read production credentials or claim live work.
 * - 'live': Connected operational office.
 *
 * Invariants:
 * - Demo mode strips/blanks all production credentials and secret patterns.
 * - Demo mode strictly rejects task claims, provider dispatch, promote, unblock, release, etc.
 * - Connection loss in live mode reports disconnected/stale and STRICTLY NEVER switches to demo fixtures.
 */

export type OfficeMode = 'demo' | 'live'

const SECRET_PATTERNS = /(?:api_?key|token|secret|password|passwd|hermes_bin|private_key|auth|credential)/i

/**
 * Returns the current office mode, checking NEXT_PUBLIC_OFFICE_MODE or OFFICE_MODE.
 * Defaults to 'live'.
 */
export function getOfficeMode(): OfficeMode {
  const envMode = process.env.NEXT_PUBLIC_OFFICE_MODE || process.env.OFFICE_MODE
  if (envMode && envMode.trim().toLowerCase() === 'demo') {
    return 'demo'
  }
  return 'live'
}

/**
 * Convenience helper to determine if current runtime is in demo mode.
 */
export function isDemoMode(): boolean {
  return getOfficeMode() === 'demo'
}

/**
 * In demo mode, strips/blanks all production credentials and secret patterns
 * (AI_API_KEY, HERMES_BIN, bridge tokens, API keys, passwords, client secrets, etc.).
 * In live mode, returns credentials intact.
 */
export function sanitizeCredentialsForMode<T extends Record<string, any>>(
  credentials: T,
  mode: OfficeMode = getOfficeMode()
): T {
  if (mode !== 'demo') {
    return { ...credentials }
  }

  const sanitized: Record<string, any> = {}
  for (const [key, value] of Object.entries(credentials)) {
    if (SECRET_PATTERNS.test(key)) {
      sanitized[key] = ''
    } else {
      sanitized[key] = value
    }
  }
  return sanitized as T
}

export type ModeActionCheck =
  | { allowed: true }
  | { allowed: false; reason: 'demo_mode_cannot_claim_live_work' }

/**
 * In demo mode, rejects task claims, provider dispatch, unblock, promote, release, pause, resume, etc.
 * with reason 'demo_mode_cannot_claim_live_work'.
 */
export function checkActionAllowedInMode(
  action: string,
  mode: OfficeMode = getOfficeMode()
): ModeActionCheck {
  if (mode === 'demo') {
    return {
      allowed: false,
      reason: 'demo_mode_cannot_claim_live_work',
    }
  }
  return { allowed: true }
}

export interface ConnectionLossResult {
  status: 'disconnected' | 'stale' | 'demo'
  fallbackToDemo: boolean
  activeFixtureAgents: boolean
}

/**
 * Handles connection loss transition.
 *
 * Strict invariant: Connection loss in live mode transitions to 'disconnected' / 'stale'
 * and STRICTLY NEVER switches to demo fixtures.
 */
export function handleConnectionLoss(
  currentMode: OfficeMode = getOfficeMode(),
  liveStatus: string = 'connected'
): ConnectionLossResult {
  if (currentMode === 'live') {
    return {
      status: 'disconnected',
      fallbackToDemo: false,
      activeFixtureAgents: false,
    }
  }

  return {
    status: 'demo',
    fallbackToDemo: true,
    activeFixtureAgents: true,
  }
}
