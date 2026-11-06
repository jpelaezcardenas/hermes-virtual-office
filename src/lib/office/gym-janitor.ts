/**
 * gym-janitor.ts — Gym skill/eval evidence & Janitor outcome verification fixtures.
 *
 * Task 9.12 of bunker-virtual-office OpenSpec change.
 *
 * Spec requirements:
 * - Gym exercise animation SHALL require corresponding runtime evidence of skill loading,
 *   installation, evaluation or test execution.
 * - Idle leisure and isolated prompt keywords SHALL NOT activate gym exercise animation.
 * - Janitor completion animation SHALL require successful confirmed recovery and actual runtime readback.
 * - Explicitly isolated DEMO fixtures MAY illustrate these states with a persistent DEMO label
 *   and SHALL NOT claim live evidence.
 */

export interface GymEvidenceRecord {
  id: string
  agentName: string
  kind: 'skill_eval' | 'test_run' | 'benchmark' | 'eval_execution'
  testId?: string
  skillName?: string
  score?: number
  status: 'passed' | 'running' | 'completed'
  timestamp: number
  isDemo: boolean
}

export interface GymAccessResult {
  allowed: boolean
  reason: string
  evidence?: GymEvidenceRecord
}

export interface JanitorReadbackRecord {
  sessionId: string
  preResetHash: string
  postResetHash: string
  verifiedClean: boolean
  actualReadbackTimestamp: number
}

export interface JanitorOutcomeFixture {
  id: string
  sessionId: string
  previewConfirmed: boolean
  adminConfirmed: boolean
  resetSuccess: boolean
  readbackVerified: boolean
  animationAllowed: boolean
  isDemo: boolean
}

export interface JanitorVerificationResult {
  animationAllowed: boolean
  reason: string
}

// In-memory store for gym evidence
const evidenceStore: Map<string, GymEvidenceRecord> = new Map()

const GYM_KEYWORDS = new Set([
  'gym',
  'workout',
  'exercise',
  'benchpress',
  'pullup',
  'muscleup',
  'barbell',
  'dumbbell',
])

export function registerGymEvidence(evidence: GymEvidenceRecord): void {
  evidenceStore.set(evidence.id, { ...evidence })
}

export function hasGymEvidence(agentName: string): boolean {
  if (!agentName) return false
  const target = agentName.toLowerCase()
  for (const ev of evidenceStore.values()) {
    if (ev.agentName.toLowerCase() === target) {
      if (ev.status === 'passed' || ev.status === 'completed' || ev.status === 'running') {
        return true
      }
    }
  }
  return false
}

export function getLatestGymEvidence(agentName: string): GymEvidenceRecord | undefined {
  if (!agentName) return undefined
  const target = agentName.toLowerCase()
  let latest: GymEvidenceRecord | undefined
  for (const ev of evidenceStore.values()) {
    if (ev.agentName.toLowerCase() === target) {
      if (ev.status === 'passed' || ev.status === 'completed' || ev.status === 'running') {
        if (!latest || ev.timestamp >= latest.timestamp) {
          latest = ev
        }
      }
    }
  }
  return latest
}

export function canPerformGymExercise(
  agentName: string,
  promptTextOrKeyword?: string,
): GymAccessResult {
  if (hasGymEvidence(agentName)) {
    return {
      allowed: true,
      reason: 'evidence_verified',
      evidence: getLatestGymEvidence(agentName),
    }
  }

  if (promptTextOrKeyword) {
    const lower = promptTextOrKeyword.toLowerCase()
    const words = lower.split(/[^a-z0-9_]+/)
    const hasKeyword =
      words.some((w) => GYM_KEYWORDS.has(w)) ||
      Array.from(GYM_KEYWORDS).some((k) => lower.includes(k))
    if (hasKeyword) {
      return {
        allowed: false,
        reason: 'keywords_cannot_start_gym_exercise',
      }
    }
  }

  return {
    allowed: false,
    reason: 'idle_leisure_cannot_start_gym_exercise',
  }
}

export function isDemoEvidenceIsolated(evidence: GymEvidenceRecord): boolean {
  return evidence.isDemo === true
}

export function isDemoJanitorFixtureIsolated(fixture: JanitorOutcomeFixture): boolean {
  return fixture.isDemo === true
}

export function clearGymEvidence(): void {
  evidenceStore.clear()
}

export function verifyJanitorOutcome(
  fixture: JanitorOutcomeFixture,
  readback: JanitorReadbackRecord,
): JanitorVerificationResult {
  if (!fixture.adminConfirmed) {
    return {
      animationAllowed: false,
      reason: 'admin_confirmation_required',
    }
  }

  if (!fixture.previewConfirmed) {
    return {
      animationAllowed: false,
      reason: 'preview_not_confirmed',
    }
  }

  if (!fixture.resetSuccess) {
    return {
      animationAllowed: false,
      reason: 'reset_failed',
    }
  }

  if (!readback.verifiedClean) {
    return {
      animationAllowed: false,
      reason: 'readback_not_verified',
    }
  }

  return {
    animationAllowed: true,
    reason: 'animation_allowed',
  }
}
