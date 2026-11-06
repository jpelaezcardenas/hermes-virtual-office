/**
 * task-attempt.ts — Canonical Read Model and Dispatch Confirmation for Tasks / Providers / Attempts.
 *
 * Task 9.13 of OpenSpec bunker-virtual-office change.
 *
 * Invariants:
 * - Read model derives canonical status, source links, unknown state alert, and provider info.
 * - Unknown or unfamiliar raw state maps to canonicalStatus: 'unknown', isUnknownState: true,
 *   preserving rawSourceState verbatim (never synthesized as ready/queued).
 * - Unmet parent dependencies map to canonicalStatus: 'waiting' with waitingReasons.
 * - Provider attribution for Hermes, Manus, Codex, Claude Code, and unknown.
 * - Authoritative source links for meeting, cron, crm, github, manus, and hermes.
 * - Dispatch confirmation gate: strictly requires confirmed: true.
 * - Blocked execution providers ('manus', 'codex', 'claude_code') CANNOT confirm dispatch.
 */

export type ExecutionProvider = 'hermes' | 'manus' | 'codex' | 'claude_code' | 'unknown'

export type TaskCanonicalStatus =
  | 'todo'
  | 'ready'
  | 'running'
  | 'review'
  | 'done'
  | 'blocked'
  | 'waiting'
  | 'unknown'

export type SourceLink = {
  label: string
  url: string
  kind: 'hermes' | 'manus' | 'crm' | 'github' | 'meeting' | 'cron'
}

export type TaskAttempt = {
  attemptNumber: number
  provider: ExecutionProvider
  status: string
  outcome?: string | null
  durationSec?: number | null
  error?: string | null
  startedAt?: string
  finishedAt?: string
}

export type TaskCanonicalReadModel = {
  id: string
  title: string
  canonicalStatus: TaskCanonicalStatus
  rawSourceState: string
  isUnknownState: boolean
  provider: ExecutionProvider
  sourceLinks: SourceLink[]
  attempts: TaskAttempt[]
  waitingReasons: string[]
  canDispatch: boolean
}

export const BLOCKED_EXECUTION_PROVIDERS: ReadonlySet<string> = new Set([
  'manus',
  'codex',
  'claude_code',
])

export const KNOWN_CANONICAL_STATUSES: ReadonlySet<string> = new Set([
  'todo',
  'ready',
  'running',
  'review',
  'done',
  'blocked',
])

export const VALID_EXECUTION_PROVIDERS: ReadonlySet<string> = new Set([
  'hermes',
  'manus',
  'codex',
  'claude_code',
])

/**
 * Normalize provider string to known ExecutionProvider type.
 */
export function normalizeProvider(raw?: string | null): ExecutionProvider {
  if (!raw) return 'unknown'
  const p = raw.trim().toLowerCase()
  if (p === 'claude-code' || p === 'claudecode' || p === 'claude_code') {
    return 'claude_code'
  }
  if (VALID_EXECUTION_PROVIDERS.has(p)) {
    return p as ExecutionProvider
  }
  return 'unknown'
}

/**
 * Resolve provider from task metadata, origin, explicit provider, or run history.
 */
export function resolveProvider(task: any, runs?: any[]): ExecutionProvider {
  // 1. Explicit provider on task
  if (task?.provider) {
    return normalizeProvider(task.provider)
  }

  // 2. Metadata provider
  if (task?.metadata?.provider) {
    return normalizeProvider(task.metadata.provider)
  }

  // 3. Origin provider or kind
  if (task?.origin) {
    if (task.origin.provider) {
      return normalizeProvider(task.origin.provider)
    }
    const origKind = String(task.origin.kind || '').toLowerCase()
    if (VALID_EXECUTION_PROVIDERS.has(origKind)) {
      return origKind as ExecutionProvider
    }
  }

  // 4. Runs history
  if (Array.isArray(runs) && runs.length > 0) {
    for (const r of runs) {
      const p = r?.provider || r?.profile
      if (p) {
        const norm = normalizeProvider(p)
        if (norm !== 'unknown') return norm
      }
    }
  }

  // 5. Default fallback to hermes
  return 'hermes'
}

/**
 * Build authoritative source links based on origin and metadata.
 */
export function buildSourceLinks(task: any): SourceLink[] {
  const links: SourceLink[] = []
  const id = String(task?.id || '')
  const origin = task?.origin
  const meta = task?.metadata

  // Meeting
  if (origin?.kind === 'meeting') {
    const ref = origin.ref || id
    links.push({
      label: `Rapat ${ref}`,
      url: `/meetings/${ref}`,
      kind: 'meeting',
    })
  }

  // Cron
  if (origin?.kind === 'cron') {
    const ref = origin.ref || id
    links.push({
      label: `Cron ${ref}`,
      url: `/cron/${ref}`,
      kind: 'cron',
    })
  }

  // CRM
  if (origin?.kind === 'crm') {
    const ref = origin.ref || id
    links.push({
      label: `CRM ${ref}`,
      url: `/crm/${ref}`,
      kind: 'crm',
    })
  } else if (meta?.crm_deal_id || meta?.deal_id || meta?.crm_url) {
    const dealId = meta.crm_deal_id || meta.deal_id
    const url = meta.crm_url || `/crm/deals/${dealId}`
    links.push({
      label: `CRM Deal ${dealId || ''}`.trim(),
      url,
      kind: 'crm',
    })
  }

  // GitHub
  if (origin?.kind === 'github') {
    const ref = origin.ref || id
    links.push({
      label: `GitHub ${ref}`,
      url: `https://github.com/${ref}`,
      kind: 'github',
    })
  } else if (meta?.github_issue || meta?.github_pr || meta?.github_url) {
    const ghRef = meta.github_issue || meta.github_pr
    const url = meta.github_url || `https://github.com/${ghRef}`
    links.push({
      label: `GitHub ${ghRef || ''}`.trim(),
      url,
      kind: 'github',
    })
  }

  // Manus
  if (origin?.kind === 'manus') {
    const ref = origin.ref || id
    links.push({
      label: `Manus Run ${ref}`,
      url: `https://manus.im/run/${ref}`,
      kind: 'manus',
    })
  } else if (meta?.manus_run_id || meta?.manus_url) {
    const runId = meta.manus_run_id
    const url = meta.manus_url || `https://manus.im/run/${runId}`
    links.push({
      label: `Manus Run ${runId || ''}`.trim(),
      url,
      kind: 'manus',
    })
  }

  // Native Hermes link
  if (id) {
    links.push({
      label: `Hermes #${id}`,
      url: `/api/hermes/tasks/${id}`,
      kind: 'hermes',
    })
  }

  // Explicit source links
  const explicit = task?.sourceLinks || task?.source_links
  if (Array.isArray(explicit)) {
    for (const link of explicit) {
      if (link && typeof link.label === 'string' && typeof link.url === 'string') {
        links.push({
          label: link.label,
          url: link.url,
          kind: link.kind || 'hermes',
        })
      }
    }
  }

  return links
}

/**
 * Format execution attempts from runs array.
 */
export function formatTaskAttempts(runs?: any[], defaultProvider: ExecutionProvider = 'hermes'): TaskAttempt[] {
  if (!Array.isArray(runs) || runs.length === 0) return []

  return runs.map((r, idx) => {
    const prov = normalizeProvider(r?.provider || r?.profile || defaultProvider)
    return {
      attemptNumber: r?.attemptNumber ?? r?.attempt_number ?? (idx + 1),
      provider: prov,
      status: String(r?.status || 'unknown'),
      outcome: r?.outcome ?? null,
      durationSec: r?.durationSec ?? r?.duration_sec ?? null,
      error: r?.error ?? null,
      startedAt: r?.startedAt ?? r?.started_at,
      finishedAt: r?.finishedAt ?? r?.finished_at,
    }
  })
}

/**
 * Build the canonical read model for a task.
 */
export function buildTaskCanonicalReadModel(
  task: any,
  runs?: any[],
  context?: { allTasks?: any[] } | any[]
): TaskCanonicalReadModel {
  const id = String(task?.id || '')
  const title = String(task?.title || '')
  const rawStatus = String(task?.status || 'unknown')
  const statusLower = rawStatus.toLowerCase()

  // 1. Gather waiting reasons for unmet parent dependencies
  const waitingReasons: string[] = []
  if (Array.isArray(task?.waitingReasons)) {
    waitingReasons.push(...task.waitingReasons.map(String))
  } else if (Array.isArray(task?.waiting_reasons)) {
    waitingReasons.push(...task.waiting_reasons.map(String))
  } else if (Array.isArray(task?.unmetDependencies)) {
    waitingReasons.push(...task.unmetDependencies.map((d: any) => `Menunggu prasyarat: ${d}`))
  } else if (Array.isArray(task?.unmet_dependencies)) {
    waitingReasons.push(...task.unmet_dependencies.map((d: any) => `Menunggu prasyarat: ${d}`))
  } else if (Array.isArray(task?.parents) && task.parents.length > 0) {
    const allTasks: any[] = Array.isArray(context)
      ? context
      : Array.isArray(context?.allTasks)
      ? context.allTasks
      : Array.isArray(task?.allTasks)
      ? task.allTasks
      : []

    for (const p of task.parents) {
      if (typeof p === 'object' && p !== null) {
        const pId = p.id || 'unknown'
        const pState = String(p.status || '').toLowerCase()
        if (pState !== 'done' && pState !== 'archived') {
          waitingReasons.push(`Menunggu prasyarat ${pId} (${pState || 'belum selesai'})`)
        }
      } else if (typeof p === 'string') {
        const parentTask = allTasks.find((t) => t.id === p)
        if (parentTask) {
          const pState = String(parentTask.status || '').toLowerCase()
          if (pState !== 'done' && pState !== 'archived') {
            waitingReasons.push(`Menunggu prasyarat ${parentTask.title || p} (${pState})`)
          }
        } else if (task.parentStatuses && typeof task.parentStatuses === 'object') {
          const pState = String(task.parentStatuses[p] || '').toLowerCase()
          if (pState !== 'done' && pState !== 'archived') {
            waitingReasons.push(`Menunggu prasyarat ${p} (${pState || 'belum selesai'})`)
          }
        }
      }
    }
  }

  // 2. Canonical status & unknown state determination
  let canonicalStatus: TaskCanonicalStatus
  let isUnknownState = false
  let canDispatch = false

  if (waitingReasons.length > 0) {
    canonicalStatus = 'waiting'
    isUnknownState = false
    canDispatch = false
  } else if (KNOWN_CANONICAL_STATUSES.has(statusLower)) {
    canonicalStatus = statusLower as TaskCanonicalStatus
    isUnknownState = false
    canDispatch = canonicalStatus === 'todo' || canonicalStatus === 'ready' || canonicalStatus === 'blocked'
  } else {
    canonicalStatus = 'unknown'
    isUnknownState = true
    canDispatch = false
  }

  // 3. Provider resolution
  const provider = resolveProvider(task, runs)

  // 4. Source links
  const sourceLinks = buildSourceLinks(task)

  // 5. Execution attempts
  const attempts = formatTaskAttempts(runs, provider)

  return {
    id,
    title,
    canonicalStatus,
    rawSourceState: rawStatus,
    isUnknownState,
    provider,
    sourceLinks,
    attempts,
    waitingReasons,
    canDispatch,
  }
}

/**
 * Confirm and dispatch a task.
 * - Strictly requires confirmed: true (returns 'confirmation_required' otherwise).
 * - Blocked execution providers ('manus', 'codex', 'claude_code') cannot confirm dispatch
 *   (returns 'caller_provider_blocked').
 */
export function confirmAndDispatchTask(
  taskId: string,
  confirmed: boolean,
  callerRole: string
): { dispatched: boolean; reason?: string } {
  const caller = (callerRole || '').trim().toLowerCase()
  if (BLOCKED_EXECUTION_PROVIDERS.has(caller)) {
    return { dispatched: false, reason: 'caller_provider_blocked' }
  }

  if (!confirmed) {
    return { dispatched: false, reason: 'confirmation_required' }
  }

  return { dispatched: true }
}
