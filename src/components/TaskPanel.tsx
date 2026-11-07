'use client'

import { useEffect, useState } from 'react'
import { useOffice } from '@/lib/store'
import Collapsible from './Collapsible'
import ModelPicker, { type ModelChoice } from './ModelPicker'
import type { Task } from '@/types/hermes'
import { fetchJson } from '@/lib/api'
import type { EvidenceItem, EvidenceVerdict } from '@/lib/hermes/evidence'
import type { VerificationReading } from '@/lib/hermes/verification'
import {
  buildTaskCanonicalReadModel,
  type TaskCanonicalReadModel,
} from '@/lib/office/task-attempt'
import { KNOWN } from './KanbanColumns'

type RunInfo = {
  id: number
  profile: string
  status: string
  outcome?: string | null
  summary?: string | null
  error?: string | null
}

/** Bentuk GET /api/hermes/tasks/{id}/verification (TaskVerification di lib/hermes/kanban.ts). */
type Verification = VerificationReading & {
  readAt: string
}

/** Bentuk GET /api/hermes/tasks/{id}/evidence (TaskEvidence di lib/hermes/kanban.ts). */
type Evidence = {
  verdict: EvidenceVerdict
  items: EvidenceItem[]
  completedAt?: string
  completedAgeSeconds: number | null
  readAt: string
}

function age(sec: number | null): string {
  if (sec == null || sec < 0) return '—'
  if (sec < 60) return `${sec} s`
  if (sec < 3600) return `${Math.floor(sec / 60)} min`
  if (sec < 86400) return `${Math.floor(sec / 3600)} h`
  return `${Math.floor(sec / 86400)} d`
}

/**
 * How an origin reads in the panel.
 *
 * Returns null for anything that is not a cross-menu link. The CLI writes
 * `created_by` itself for ordinary tasks ('worker', 'user'), and showing "asal:
 * worker" on every task is noise — the line only earns its space when it names the
 * meeting or job the work came from.
 */
function originLabel(o?: { kind: string; ref?: string }): string | null {
  if (!o) return null
  switch (o.kind) {
    case 'meeting':
      return o.ref ? `reunión ${o.ref}` : 'reunión'
    case 'cron':
      return o.ref ? `cron ${o.ref}` : 'cron'
    case 'agent':
      return o.ref ? `agente ${o.ref}` : 'agente'
    default:
      return null
  }
}

const STATUS_LABEL: Record<string, string> = {
  todo: 'Por hacer',
  triage: 'Por clasificar / especificar',
  ready: 'Listo para asignar',
  scheduled: 'Programado',
  running: 'En curso / ejecución',
  review: 'En revisión',
  blocked: 'Bloqueado',
  done: 'Completado (informado por agente)',
  archived: 'Archivado',
  waiting: 'Esperando prerequisitos',
  unknown: 'Estado no reconocido',
}

/**
 * Task detail panel. Opened from a card on the 3D wall board or from the 2D
 * board — including tasks that are already `done`, which is why it reads the
 * run history rather than live output only.
 */
export default function TaskPanel() {
  const taskId = useOffice((s) => s.openTaskId)
  const openTask = useOffice((s) => s.openTask)
  const tasks = useOffice((s) => s.tasks)
  const agents = useOffice((s) => s.agents)
  const load = useOffice((s) => s.load)

  const [runs, setRuns] = useState<RunInfo[]>([])
  /** The same task as `/tasks/{id}` reports it — `list` has no dependency edges. */
  const [detail, setDetail] = useState<Task | null>(null)
  const [log, setLog] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [models, setModels] = useState<ModelChoice[]>([])
  const [pick, setPick] = useState('')
  const [evidence, setEvidence] = useState<Evidence | null>(null)
  const [evErr, setEvErr] = useState<string | null>(null)
  const [evBusy, setEvBusy] = useState(false)
  const [evNonce, setEvNonce] = useState(0)
  const [verify, setVerify] = useState<Verification | null>(null)
  const [vfErr, setVfErr] = useState<string | null>(null)
  const [vfBusy, setVfBusy] = useState(false)
  const [confirmDispatch, setConfirmDispatch] = useState(false)

  // `detail` first: it is the only payload with `parents`.
  const task: Task | undefined = detail?.id === taskId ? detail : tasks.find((t) => t.id === taskId)
  const agent = agents.find((a) => a.name === task?.assignee)
  const readModel: TaskCanonicalReadModel | null = task
    ? buildTaskCanonicalReadModel(task, runs, tasks)
    : null

  useEffect(() => {
    if (!taskId) return
    let alive = true
    setLoading(true)
    setErr(null)
    fetchJson<{ runs?: RunInfo[]; log?: string; task?: Task }>(`/api/hermes/tasks/${taskId}`, {
      cache: 'no-store',
    })
      .then((res) => {
        if (!alive) return
        if (!res.ok) {
          setErr(res.error || 'gagal memuat detail tugas')
          return
        }
        setRuns(res.data?.runs || [])
        setLog(res.data?.log || '')
        setDetail(res.data?.task || null)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [taskId])

  // Bukti hasil kerja: dibaca terpisah (show + runs + log + lampiran). Gagal = "gagal membaca
  // bukti", dan bukti task sebelumnya dibuang — tidak pernah dipajang sebagai bukti task ini.
  useEffect(() => {
    if (!taskId) return
    let alive = true
    setEvidence(null)
    setEvErr(null)
    setEvBusy(true)
    fetchJson<Evidence>(`/api/hermes/tasks/${taskId}/evidence`, { cache: 'no-store' })
      .then((res) => {
        if (!alive) return
        if (!res.ok || !res.data || !Array.isArray(res.data.items)) {
          setEvErr(res.error || 'gagal membaca bukti')
          return
        }
        setEvidence(res.data)
      })
      .finally(() => alive && setEvBusy(false))
    return () => {
      alive = false
    }
  }, [taskId, evNonce])

  // Verifikasi independen: klaim worker vs review. Dibaca terpisah dari jejak events.
  // Hanya untuk done/review — task lain tidak dinilai. Gagal = "gagal membaca verifikasi",
  // dan hasil task sebelumnya dibuang — tidak pernah dipajang sebagai hasil task ini.
  useEffect(() => {
    if (!taskId) return
    let alive = true
    setVerify(null)
    setVfErr(null)
    setVfBusy(true)
    fetchJson<Verification>(`/api/hermes/tasks/${taskId}/verification`, { cache: 'no-store' })
      .then((res) => {
        if (!alive) return
        if (!res.ok || !res.data || typeof res.data.verdict !== 'string') {
          setVfErr(res.error || 'gagal membaca verifikasi')
          return
        }
        setVerify(res.data)
      })
      .finally(() => alive && setVfBusy(false))
    return () => {
      alive = false
    }
  }, [taskId])

  // The model list is config, not board state: fetched once per panel, not on the
  // poll, so opening a task does not spawn a CLI read every 4 seconds.
  useEffect(() => {
    if (!taskId || models.length) return
    let alive = true
    fetchJson<{ models?: ModelChoice[] }>('/api/hermes/models', { cache: 'no-store' }).then((res) => {
      if (alive && res.ok) setModels(res.data?.models || [])
    })
    return () => {
      alive = false
    }
  }, [taskId, models.length])

  // Show what the task is actually pinned to, not a stale pick from another task.
  useEffect(() => {
    setPick(task?.model || '')
    setNote(null)
    setConfirmDispatch(false)
  }, [taskId, task?.model])

  if (!taskId) return null

  /** run | promote | set-model */
  async function act(action: 'run' | 'promote' | 'set-model', extra: Record<string, unknown> = {}) {
    if (action === 'run' && isUnexecutable) {
      setNote('Tugas diarsipkan / status tidak dikenal tidak dapat dieksekusi.')
      return
    }
    setBusy(true)
    setNote(null)
    setConfirmDispatch(false)
    try {
      const res = await fetchJson<{ note?: string; mine?: boolean }>(
        `/api/hermes/tasks/${taskId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...extra }),
        },
      )
      if (!res.ok) throw new Error(res.error || 'aksi gagal')
      setNote(res.data?.note || (action === 'set-model' ? 'Model disimpan.' : 'Selesai.'))
      await load()
      const fresh = await fetchJson<{ runs?: RunInfo[]; log?: string; task?: Task }>(
        `/api/hermes/tasks/${taskId}`,
        { cache: 'no-store' },
      )
      if (fresh.ok) {
        setRuns(fresh.data?.runs || [])
        setLog(fresh.data?.log || '')
        setDetail(fresh.data?.task || null)
      }
      setEvNonce((n) => n + 1)
    } catch (e) {
      setNote(`Gagal: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const isArchived = task?.status === 'archived' || readModel?.canonicalStatus === 'archived'
  const isUnknown = Boolean(readModel?.isUnknownState || (task?.status && !KNOWN.includes(task.status)))
  const isUnexecutable = Boolean(isArchived || isUnknown)

  const dispatchDisabledReason = isUnexecutable
    ? 'Tugas diarsipkan / status tidak dikenal tidak dapat dieksekusi'
    : readModel?.canonicalStatus === 'waiting'
    ? 'Tugas masih menunggu dependensi prasyarat'
    : task?.status === 'running' || task?.status === 'review' || task?.status === 'done'
    ? 'Tugas sedang berjalan, menunggu review, atau telah selesai'
    : 'Buka konfirmasi eksekusi tugas'

  const blocked = task?.status === 'blocked' || task?.status === 'scheduled'

  return (
    <aside className="vp-panel left-0">
      <header className="vp-panel-head">
        <h2>Detail tugas</h2>
        <button className="vp-x" onClick={() => openTask(null)} aria-label="Tutup">
          ×
        </button>
      </header>

      <div className="vp-pad flex flex-col gap-3">
        {!task && <div className="vp-muted">Tugas {taskId} tidak ada di board aktif.</div>}

        {task && (
          <>
            <div className="vp-kv">
              <span>judul</span>
              <b>{task.title}</b>
            </div>
            <div className="vp-kv">
              <span>status</span>
              <b>
                {STATUS_LABEL[readModel?.canonicalStatus || task.status] || readModel?.canonicalStatus || task.status}
                {readModel?.isUnknownState && (
                  <span className="vp-chip vp-chip-warn ml-2">raw: {readModel.rawSourceState}</span>
                )}
              </b>
            </div>
            {readModel && (
              <div className="vp-kv">
                <span>provider eksekusi</span>
                <b className="uppercase">{readModel.provider}</b>
              </div>
            )}

            <div className="vp-kv">
              <span>asignado a</span>
              <b>{task.assignee || '—'}{agent ? ` (${agent.role})` : ''}</b>
            </div>
            <div className="vp-kv">
              <span>prioridad</span>
              <b>{task.priority}</b>
            </div>
            <div className="vp-kv">
              <span>modelo IA</span>
              <b>{task.model || 'por defecto'}</b>
            </div>
            {task.updatedAt && (
              <div className="vp-kv">
                <span>modificado</span>
                <b>{new Date(task.updatedAt).toLocaleString('es-CO')}</b>
              </div>
            )}
            {originLabel(task.origin) && (
              <div className="vp-kv">
                <span>origen</span>
                <b>{originLabel(task.origin)}</b>
              </div>
            )}
            <code className="vp-code-block">{task.id}</code>

            {readModel?.isUnknownState && (
              <div className="p-2 border border-amber-500/50 bg-amber-500/10 rounded flex flex-col gap-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="vp-chip vp-chip-warn">Estado no reconocido</span>
                  <code className="text-xs bg-black/40 px-1 py-0.5 rounded">{readModel.rawSourceState}</code>
                </div>
                <div className="vp-muted text-xs">
                  El estado de esta tarea no es reconocido por el tablero oficial. Se mantiene como está sin entrar en cola de ejecución.
                </div>
              </div>
            )}

            {readModel && readModel.waitingReasons.length > 0 && (
              <div className="p-2 border border-blue-500/40 bg-blue-500/10 rounded flex flex-col gap-1 text-sm">
                <div className="font-semibold text-blue-400">Esperando dependencias ({readModel.waitingReasons.length})</div>
                <ul className="list-disc list-inside text-xs vp-muted flex flex-col gap-0.5">
                  {readModel.waitingReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {readModel && readModel.sourceLinks.length > 0 && (
              <>
                <div className="vp-sub">ENLACES DE REFERENCIA ({readModel.sourceLinks.length})</div>
                <div className="flex flex-col gap-1">
                  {readModel.sourceLinks.map((link, i) => (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="vp-run flex items-center justify-between text-left hover:brightness-110"
                      title={`Abrir ${link.label}`}
                    >
                      <span className="font-medium">{link.label}</span>
                      <span className="vp-chip text-[10px] uppercase">{link.kind}</span>
                    </a>
                  ))}
                </div>
              </>
            )}

            {!!task.parents?.length && (
              <>
                <div className="vp-sub">PRERREQUISITOS ({task.parents.length})</div>
                <div className="flex flex-col gap-1">
                  {task.parents.map((id) => {
                    const parent = tasks.find((t) => t.id === id)
                    const state = parent?.status
                    const clear = state === 'done' || state === 'archived'
                    return (
                      <button
                        key={id}
                        className="vp-run text-left"
                        onClick={() => openTask(id)}
                        title="Abrir esta tarea"
                      >
                        <b className={clear ? '' : 'vp-warn'}>{clear ? 'completado' : STATUS_LABEL[state || ''] || state || 'no presente en tablero'}</b>
                        <span className="vp-muted"> · {parent?.title || id}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="vp-muted">
                  Esta tarea requiere completar todos los prerrequisitos anteriores antes de ejecutarse.
                </div>
              </>
            )}

            <div className="vp-sub">EJECUTAR</div>
            {confirmDispatch && !isUnexecutable && (
              <div className="p-3 border border-amber-500/40 bg-amber-500/10 rounded flex flex-col gap-2">
                <div className="text-sm font-medium">
                  ¿Confirmar ejecución de la tarea: <span className="font-bold">{readModel?.title || task.title}</span>?
                </div>
                <div className="text-xs vp-muted">
                  Esta acción solicitará al despachador enviar la tarea para su ejecución.
                </div>
                <div className="flex gap-2 mt-1">
                  <button
                    className="vp-btn"
                    disabled={busy}
                    onClick={() => {
                      setConfirmDispatch(false)
                      void act('run')
                    }}
                  >
                    {busy ? '…' : 'Confirmar'}
                  </button>
                  <button
                    className="vp-btn bg-neutral-700 hover:bg-neutral-600"
                    disabled={busy}
                    onClick={() => setConfirmDispatch(false)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button
                className="vp-btn"
                disabled={
                  busy ||
                  isUnexecutable ||
                  (readModel ? !readModel.canDispatch : (task.status === 'running' || task.status === 'review' || task.status === 'done'))
                }
                onClick={() => {
                  if (!isUnexecutable) {
                    setConfirmDispatch(true)
                  }
                }}
                title={dispatchDisabledReason}
              >
                {busy ? '…' : 'Ejecutar'}
              </button>
            </div>
            {isUnexecutable ? (
              <div className="vp-muted text-xs text-amber-400">
                Tareas archivadas o con estado desconocido no pueden ejecutarse.
              </div>
            ) : blocked ? (
              <div className="vp-muted">
                Estado <b>{task.status}</b>: al ejecutar se desbloqueará automáticamente tras confirmar.
              </div>
            ) : null}
            {!isUnexecutable && readModel?.canonicalStatus === 'waiting' && (
              <div className="vp-muted text-xs">
                La tarea espera prerrequisitos pendientes y no puede iniciarse aún.
              </div>
            )}


            <div className="vp-sub">MODELO DE IA PARA ESTA TAREA</div>
            <ModelPicker
              value={pick}
              onChange={setPick}
              models={models}
              emptyLabel={`Por defecto${agent ? ` (${agent.name})` : ''}`}
              disabled={busy}
              title="Aplica en la próxima ejecución del agente"
            />
            <div className="flex gap-2">
              <button
                className="vp-btn"
                disabled={busy || pick === (task.model || '')}
                onClick={() => {
                  const hit = models.find((m) => m.model === pick)
                  void act('set-model', pick ? { model: pick, provider: hit?.provider } : { model: null })
                }}
                title="Aplica en la próxima ejecución del agente"
              >
                Guardar modelo
              </button>
            </div>
            {note && <div className="vp-note">{note}</div>}

            {task.body && <Collapsible label="Descripción" text={task.body} />}

            <div className="vp-sub">VERIFICACIÓN</div>
            {vfBusy && <div className="vp-muted">cargando verificación…</div>}
            {vfErr && <div className="vp-err">error al leer verificación: {vfErr}</div>}
            {verify && (
              <>
                <div className="vp-kv">
                  <span>estado</span>
                  {verify.verdict === 'verified' ? (
                    <b>
                      <span className="vp-chip">verificado</span>
                      {verify.reviewer && <span className="vp-muted"> · por {verify.reviewer}</span>}
                    </b>
                  ) : verify.verdict === 'claim' ? (
                    <b>
                      <span className="vp-chip vp-chip-warn">declarado</span>
                      <span className="vp-muted"> · pendiente de revisión</span>
                    </b>
                  ) : task?.status === 'review' ? (
                    <b className="vp-muted">en revisión{verify.reviewer ? ` por ${verify.reviewer}` : ''}</b>
                  ) : (
                    <b className="vp-muted">en progreso — sin evaluar</b>
                  )}
                </div>
                {verify.verdict === 'claim' && <div className="vp-warn">{verify.why}</div>}
                {verify.verdict === 'verified' && verify.verifiedAt != null && (
                  <div className="vp-muted">
                    aprobado {new Date(verify.verifiedAt * 1000).toLocaleString('es-CO')}
                    {verify.implementer ? ` · ejecutado por ${verify.implementer}` : ''}
                  </div>
                )}
                {verify.verdict === 'open' && verify.requestedAt != null && (
                  <div className="vp-muted">
                    enviado {new Date(verify.requestedAt * 1000).toLocaleString('es-CO')}
                    {verify.implementer ? ` por ${verify.implementer}` : ''}
                  </div>
                )}
                <div className="vp-muted">
                  leído hace {age(Math.max(0, Math.round((Date.now() - Date.parse(verify.readAt)) / 1000)))}
                </div>
              </>
            )}

            <div className="vp-sub">EVIDENCIA DE RESULTADOS</div>
            {evBusy && <div className="vp-muted">cargando evidencias…</div>}
            {evErr && <div className="vp-err">error al leer evidencias: {evErr}</div>}
            {evidence && (
              <>
                <div className="vp-kv">
                  <span>evaluación</span>
                  {evidence.verdict === 'proven' ? (
                    <b>
                      <span className="vp-chip">demostrado</span>
                      {evidence.completedAgeSeconds != null && (
                        <span className="vp-muted"> · completado hace {age(evidence.completedAgeSeconds)}</span>
                      )}
                    </b>
                  ) : evidence.verdict === 'unproven' ? (
                    <b>
                      <span className="vp-chip vp-chip-warn">SIN EVIDENCIA</span>
                    </b>
                  ) : (
                    <b className="vp-muted">en progreso — sin evaluar</b>
                  )}
                </div>
                {evidence.verdict === 'unproven' && (
                  <div className="vp-warn">
                    Marcado como completado pero sin resumen, métricas de ejecución, logs o archivos adjuntos comprobables.
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {evidence.items
                    .filter((it) => it.kind === 'summary' || it.kind === 'run')
                    .map((it, i) => (
                      <Collapsible key={`${it.kind}-${i}`} label={it.label} text={it.body || ''} />
                    ))}
                  {evidence.items.some((it) => it.kind === 'attachment') && (
                    <div className="vp-run">
                      <b>adjuntos</b>
                      {evidence.items
                        .filter((it) => it.kind === 'attachment')
                        .map((it, i) => (
                          <div key={i} className="vp-muted">{it.label}</div>
                        ))}
                    </div>
                  )}
                  {evidence.items.some((it) => it.kind === 'log') && (
                    <div className="vp-muted">logs de agente disponibles — ver sección abajo.</div>
                  )}
                  {!evidence.items.length && <div className="vp-muted">sin evidencias registradas</div>}
                </div>
                <div className="vp-muted">
                  leído hace {age(Math.max(0, Math.round((Date.now() - Date.parse(evidence.readAt)) / 1000)))}
                </div>
              </>
            )}

            <div className="vp-sub">HISTORIAL DE EJECUCIONES ({runs.length})</div>
            {loading && <div className="vp-muted">cargando…</div>}
            {err && <div className="vp-err">{err}</div>}
            <div className="flex flex-col gap-2">
              {runs
                .slice()
                .reverse()
                .map((r) => (
                  <div key={r.id} className="vp-run">
                    <b>{r.status}</b>
                    {r.outcome ? <span> · {r.outcome}</span> : null}
                    {r.profile ? <span className="vp-muted"> · {r.profile}</span> : null}
                    {r.summary && <div className="vp-muted">{r.summary}</div>}
                    {r.error && <div className="vp-err">{r.error}</div>}
                  </div>
                ))}
              {!loading && !runs.length && <div className="vp-muted">sin ejecuciones aún</div>}
            </div>

            <Collapsible
              label="Logs del agente"
              text={log}
              count={log.trim() ? log.trim().split('\n').length : undefined}
              empty="sin logs registrados"
            />
          </>
        )}
      </div>
    </aside>
  )
}
