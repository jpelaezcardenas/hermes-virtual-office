/**
 * Huddle and reviewer-to-owner path policy for Bunker Virtual Office.
 *
 * Task 9.10 of bunker-virtual-office OpenSpec change.
 *
 * Rules:
 * 1. Operational huddles require correlated activity:
 *    - Explicit correlation ID match -> 'verified_collaboration'.
 *    - Shared task ID exchange -> 'verified_collaboration'.
 *    - Simultaneous speech (temporal proximity <= maxTimeDeltaMs) without correlation ID ->
 *      strictly 'inferred_activity' ("Simultaneous speech without correlation evidence; cannot claim collaboration").
 *    - Unrelated speech separated by > maxTimeDeltaMs without correlation -> null (no huddle).
 * 2. Reviewer-to-owner target resolution:
 *    - Resolves owner of task under review (owner || assignee || author).
 *    - If owner has a desk in the roster -> visits owner's desk ({ targetDeskIndex: ownerDesk, visit: true, reason: 'owner_desk' }).
 *    - If owner has no desk or unknown -> falls back to reviewer's desk ({ targetDeskIndex: reviewer.deskIndex, visit: false, reason: 'fallback_reviewer_desk' }).
 */

export type HuddleClassification = 'verified_collaboration' | 'inferred_activity'

export type HuddleEvent = {
  agent: string
  text: string
  ts: number
  correlationId?: string
  sessionId?: string
  taskId?: string
}

export type CorrelatedHuddle = {
  id: string
  participants: [string, string]
  classification: HuddleClassification
  correlationId?: string
  reason: string
  timestamp: number
}

/**
 * Classifies speech events between two agents into a correlated huddle or null.
 *
 * Enforces the strict rule that simultaneous speech without correlation evidence
 * is classified as inferred_activity and NEVER claimed as collaboration.
 */
export function classifyHuddle(
  e1: HuddleEvent,
  e2: HuddleEvent,
  maxTimeDeltaMs = 5000,
): CorrelatedHuddle | null {
  if (e1.agent === e2.agent) {
    return null
  }

  const participants: [string, string] = [e1.agent, e2.agent]
  const timestamp = Math.max(e1.ts, e2.ts)
  const timeDelta = Math.abs(e1.ts - e2.ts)
  const huddleId = `huddle-${[e1.agent, e2.agent].sort().join('-')}-${Math.min(e1.ts, e2.ts)}`

  // 1. Explicit correlation ID match
  if (e1.correlationId && e2.correlationId && e1.correlationId === e2.correlationId) {
    return {
      id: huddleId,
      participants,
      classification: 'verified_collaboration',
      correlationId: e1.correlationId,
      reason: `Backed by explicit correlation ID: ${e1.correlationId}`,
      timestamp,
    }
  }

  // 2. Shared task ID exchange
  if (e1.taskId && e2.taskId && e1.taskId === e2.taskId) {
    return {
      id: huddleId,
      participants,
      classification: 'verified_collaboration',
      correlationId: e1.correlationId ?? e2.correlationId,
      reason: `Backed by shared task exchange: ${e1.taskId}`,
      timestamp,
    }
  }

  // 3. Temporal proximity without correlation evidence
  if (timeDelta <= maxTimeDeltaMs) {
    return {
      id: huddleId,
      participants,
      classification: 'inferred_activity',
      correlationId: undefined,
      reason: 'Simultaneous speech without correlation evidence; cannot claim collaboration',
      timestamp,
    }
  }

  // 4. Exceeds temporal threshold and no correlation
  return null
}

export type ReviewerTargetResolution = {
  targetDeskIndex: number | null
  visit: boolean
  reason: string
}

/**
 * Resolves the desk target for an agent performing a review.
 *
 * If the task owner has a desk in the roster, the reviewer visits that desk.
 * Otherwise, the reviewer falls back to their own desk without inventing phantom desks.
 */
export function resolveReviewerTarget(
  reviewer: { name: string; deskIndex: number | null },
  task: { id: string; owner?: string | null; assignee?: string | null; author?: string | null },
  roster: Map<string, { deskIndex: number | null }> | Record<string, { deskIndex: number | null }>,
): ReviewerTargetResolution {
  // Determine task owner
  let owner: string | undefined = task.owner || undefined
  if (!owner) {
    if (task.assignee && task.assignee !== reviewer.name) {
      owner = task.assignee
    } else if (task.author) {
      owner = task.author
    } else if (task.assignee) {
      owner = task.assignee
    }
  }

  if (owner) {
    const entry = roster instanceof Map ? roster.get(owner) : roster[owner]
    if (entry && entry.deskIndex !== null && entry.deskIndex !== undefined) {
      return {
        targetDeskIndex: entry.deskIndex,
        visit: true,
        reason: 'owner_desk',
      }
    }
  }

  return {
    targetDeskIndex: reviewer.deskIndex,
    visit: false,
    reason: 'fallback_reviewer_desk',
  }
}
