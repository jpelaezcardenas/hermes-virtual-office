import { NextRequest, NextResponse } from 'next/server'
import { createTask, listAgents, listAssignees, listTasks } from '@/lib/hermes/kanban'
import { visible } from '@/lib/hermes/office-membership'
import { blockedAssigneesFor } from '@/lib/hermes/approvals'
import type { TaskOrigin } from '@/types/hermes'
import { assertLocalWriteRequest } from '@/lib/local-guard'

export const dynamic = 'force-dynamic'

/** The board: tasks plus the agents staffing them. */
export async function GET() {
  try {
    // `--archived` is inclusive, so this is the live board PLUS the archive: the
    // 2D view has an ARSIP column that stayed permanently empty without it.
    // The two CLI reads are independent, so they run together — sequentially
    // they cost ~2.8 s per poll on a small machine.
    const [tasks, assignees] = await Promise.all([
      listTasks({ includeArchived: true }),
      listAssignees(),
    ])
    // Apply the hide list: a hidden profile is absent from the office but its
    // tasks stay on the board, so the work is never hidden, only the avatar.
    // Ini yang memberi makan avatar: agent yang task aktifnya menunggu manusia harus tampil
    // 'blocked' DI SINI, bukan hanya di menu spawn.
    const agents = visible(await listAgents(tasks, assignees, await blockedAssigneesFor(tasks)))
    return NextResponse.json({ tasks, agents })
  } catch (err) {
    // Fallback to Contexia agent roster (11 native Contexia agents) if local CLI is unavailable
    const contexiaAgents = [
      { name: 'hermes', displayName: 'Hermes', role: 'orchestrator', division: 'exec', deskIndex: null, status: 'idle', model: 'anthropic/claude-3-7-sonnet' },
      { name: 'taty', displayName: 'Taty', role: 'manager', division: 'content', deskIndex: 7, status: 'idle', model: 'openai/gpt-4o' },
      { name: 'orchestrator', displayName: 'Orchestrator', role: 'orchestrator', division: 'exec', deskIndex: 9, status: 'idle', model: 'anthropic/claude-3-7-sonnet' },
      { name: 'contexia-dev', displayName: 'Contexia Dev', role: 'backend', division: 'tech', deskIndex: 8, status: 'idle', model: 'deepseek/deepseek-chat' },
      { name: 'kb', displayName: 'Kb', role: 'researcher', division: 'exec', deskIndex: 5, status: 'idle', model: 'anthropic/claude-3-7-sonnet' },
      { name: 'social-ops', displayName: 'Social Ops', role: 'content', division: 'content', deskIndex: 6, status: 'idle', model: 'google/gemini-2.0-flash' },
      { name: 'radar', displayName: 'Radar', role: 'marketing', division: 'growth', deskIndex: 4, status: 'idle', model: 'google/gemini-2.0-flash' },
      { name: 'pulso', displayName: 'Pulso', role: 'manager', division: 'growth', deskIndex: 3, status: 'idle', model: 'openai/gpt-4o' },
      { name: 'approval-queue', displayName: 'Approval Queue', role: 'qa', division: 'exec', deskIndex: 2, status: 'idle', model: 'anthropic/claude-3-7-sonnet' },
      { name: 'centinela', displayName: 'Centinela', role: 'manager', division: 'tech', deskIndex: 0, status: 'idle', model: 'openai/gpt-4o' },
      { name: 'auditoria', displayName: 'Auditoria', role: 'qa', division: 'tech', deskIndex: 1, status: 'idle', model: 'anthropic/claude-3-7-sonnet' },
    ]
    return NextResponse.json({ tasks: [], agents: contexiaAgents })
  }
}

/**
 * Create one or more tasks.
 *
 * ONE endpoint for both shapes, because they are the same operation:
 *
 *   { title, assignee, ... }        -> a single task
 *   { origin, items: [...] }        -> several, all sharing an origin
 *
 * These used to be two routes (`tasks/create` and `tasks/from-items`) which
 * duplicated the whole create path, the origin validation and the partial-failure
 * reporting. Two copies of the same logic drift; one cannot.
 *
 * `origin` records where the work came from so the board can show it and the source
 * panel can list what it produced. It is written to `created_by` as a marker.
 */
export async function POST(req: NextRequest) {
  const denied = assertLocalWriteRequest(req)
  if (denied) return denied
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return bad('body harus JSON')
  }

  const origin = readOrigin((body as Record<string, unknown>).origin)

  // ---- batch shape: { items: [...] } ----
  const items = (body as Record<string, unknown>).items
  if (Array.isArray(items)) {
    if (!origin) return bad('origin.kind tidak dikenal')
    if (!items.length) return bad('tidak ada item')
    return createMany(items, origin)
  }

  // ---- single shape: { title, assignee } ----
  const title = typeof (body as { title?: unknown }).title === 'string' ? (body as { title: string }).title.trim() : ''
  const assignee =
    typeof (body as { assignee?: unknown }).assignee === 'string'
      ? (body as { assignee: string }).assignee.trim()
      : ''
  if (!title) return bad('title wajib')
  if (!assignee) return bad('assignee wajib')

  const b = body as Record<string, unknown>
  try {
    const task = await createTask({
      title: title.slice(0, 300),
      assignee,
      body: typeof b.body === 'string' ? b.body : undefined,
      priority: Number.isFinite(Number(b.priority)) ? Number(b.priority) : undefined,
      origin,
    })
    return NextResponse.json({ success: true, task }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'dispatch_failed', message: (err as Error).message, status: 502 } },
      { status: 502 },
    )
  }
}

/** Accept only origins the UI may set, so `created_by` stays parseable. */
function readOrigin(raw: unknown): TaskOrigin | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const kind = String(o.kind ?? '')
  if (kind !== 'meeting' && kind !== 'cron' && kind !== 'agent' && kind !== 'manual') {
    return undefined
  }
  const ref = typeof o.ref === 'string' && o.ref.trim() ? o.ref.trim().slice(0, 120) : undefined
  return { kind, ref }
}

function bad(message: string) {
  return NextResponse.json(
    { error: { code: 'invalid_request', message, status: 400 } },
    { status: 400 },
  )
}

/**
 * Create many tasks under one origin.
 *
 * Partial success is the normal case — one row with no assignee must not lose the
 * others — so the reply reports both lists and the caller decides what to say.
 */
async function createMany(raw: unknown[], origin: TaskOrigin) {
  const created: { id: string; title: string; assignee: string }[] = []
  const failed: { title: string; error: string }[] = []

  // Bounded: a runaway source must not create hundreds of tasks in one request.
  for (const it of raw.slice(0, 25)) {
    const row = (it ?? {}) as Record<string, unknown>
    const title = String(row.title ?? row.text ?? '').trim().slice(0, 300)
    const assignee = String(row.assignee ?? '').trim()
    if (!title) continue
    if (!assignee) {
      failed.push({ title, error: 'penanggung belum dipilih' })
      continue
    }
    try {
      const task = await createTask({
        title,
        assignee,
        body: typeof row.body === 'string' && row.body.trim() ? row.body : undefined,
        priority: Number.isFinite(Number(row.priority)) ? Number(row.priority) : undefined,
        origin,
      })
      created.push({ id: task.id, title: task.title, assignee })
    } catch (err) {
      failed.push({ title, error: (err as Error).message })
    }
  }

  return NextResponse.json(
    { success: created.length > 0, created, failed, origin },
    { status: created.length ? 201 : 502 },
  )
}
