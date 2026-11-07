'use client'

import { useEffect, useState } from 'react'
import { useOffice } from '@/lib/store'
import Collapsible from './Collapsible'
import type { Agent, Task } from '@/types/hermes'
import { fetchJson } from '@/lib/api'
import { formatBoundedLog } from '@/lib/office/monitor-transcript'

type RunInfo = {
  id: number
  profile: string
  status: string
  outcome?: string | null
  summary?: string | null
  error?: string | null
}

/** "Intip layar": live log + steer/cancel for whoever occupies a desk. */
export default function PeekPanel() {
  const desk = useOffice((s) => s.peekDesk)
  const setPeek = useOffice((s) => s.setPeek)
  const agents = useOffice((s) => s.agents)
  const tasks = useOffice((s) => s.tasks)
  const load = useOffice((s) => s.load)

  const [log, setLog] = useState('')
  const [runs, setRuns] = useState<RunInfo[]>([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const agent: Agent | undefined = agents.find((a) => a.deskIndex === desk)
  const task: Task | undefined = tasks.find((t) => t.id === agent?.currentTaskId)

  useEffect(() => {
    if (!task) {
      setLog('')
      setRuns([])
      return
    }
    let alive = true
    const pull = async () => {
      // Polls every 5 s: a dropped packet must leave the last known log on screen
      // rather than clearing it or flashing an error.
      const res = await fetchJson<{ log?: string; runs?: RunInfo[] }>(
        `/api/hermes/tasks/${task.id}`,
        { cache: 'no-store' },
      )
      if (!alive || !res.ok || !res.data) return
      setLog(res.data.log || '')
      setRuns(res.data.runs || [])
    }
    pull()
    const id = setInterval(pull, 5000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [task?.id])

  if (desk == null) return null

  const boundedLog = formatBoundedLog(log)

  async function act(action: 'steer' | 'cancel') {
    if (!task) return
    setBusy(true)
    setNote(null)
    try {
      const res = await fetchJson(`/api/hermes/tasks/${task.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, message: msg }),
      })
      if (!res.ok) throw new Error(res.error || 'aksi gagal')
      setNote(action === 'steer' ? 'Arahan terkirim ke worker.' : 'Worker claim dilepas.')
      setMsg('')
      void load()
    } catch (e) {
      setNote(`Error: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="vp-panel right-0">
      <header className="vp-panel-head">
        <h2>Escritorio {desk + 1} · {agent?.displayName || 'vacío'}</h2>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-500/30 whitespace-nowrap">
          [SOLO LECTURA] · Monitor
        </span>
        <button className="vp-x" onClick={() => setPeek(null)} aria-label="Cerrar">×</button>
      </header>

      {!agent && <div className="vp-pad vp-muted">No hay agente en este escritorio.</div>}

      {agent && (
        <div className="vp-pad flex flex-col gap-3">
          <div className="vp-kv">
            <span>estado</span><b>{agent.status}</b>
          </div>
          <div className="vp-kv">
            <span>tarea</span><b>{task?.title || '— sin tarea activa —'}</b>
          </div>
          {task && <code className="vp-code-block">{task.id}</code>}

          {task && (
            <>
              <div className="max-h-[50vh] overflow-y-auto overscroll-contain flex flex-col gap-2">
                <Collapsible
                  label={
                    boundedLog.isTruncated
                      ? `Último registro [SOLO LECTURA] (${boundedLog.displayedLines}/${boundedLog.totalLines})`
                      : 'Último registro [SOLO LECTURA]'
                  }
                  text={boundedLog.text}
                  count={boundedLog.displayedLines > 0 ? boundedLog.displayedLines : undefined}
                  defaultOpen
                  empty="registro vacío"
                />
              </div>

              <Collapsible
                label="Historial de ejecuciones"
                count={runs.length}
                empty="sin ejecuciones aún"
              >
                <div className="flex flex-col gap-1 max-h-[35vh] overflow-y-auto overscroll-contain">
                  {runs.slice(-6).reverse().map((r) => {
                    const isFailed = r.status === 'failed' || r.status === 'error' || Boolean(r.error)
                    return (
                      <div
                        key={r.id}
                        className={`vp-run ${isFailed ? 'border-l-red-500 bg-red-950/20 p-1.5 rounded' : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          <b>{r.status}</b>
                          {isFailed && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-900/60 text-red-200 border border-red-500/40">
                              [FALLIDO]
                            </span>
                          )}
                          {r.outcome ? <span> · {r.outcome}</span> : null}
                        </div>
                        {r.summary ? <div className="vp-muted">{r.summary}</div> : null}
                        {r.error ? <div className="vp-err text-red-300 font-mono text-xs mt-1">{r.error}</div> : null}
                      </div>
                    )
                  })}
                </div>
              </Collapsible>

              <div className="vp-sub">DIRIGIR / DETENER</div>
              <textarea
                className="vp-input"
                rows={3}
                placeholder="ej. enfocarse en pruebas de backend"
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
              />
              <div className="flex gap-2">
                <button className="vp-btn" disabled={busy || !msg.trim()} onClick={() => act('steer')}>
                  Dirigir
                </button>
                <button className="vp-btn vp-btn-warn" disabled={busy} onClick={() => act('cancel')}>
                  Detener
                </button>
              </div>
              {note && <div className="vp-note">{note}</div>}
            </>
          )}
        </div>
      )}
    </aside>
  )
}
