'use client'

import { useEffect, useState } from 'react'
import { useOffice } from '@/lib/store'
import Collapsible from './Collapsible'
import FullPanel from './FullPanel'
import ActionItems, { type Candidate } from './ActionItems'
import { fetchJson } from '@/lib/api'
import {
  getMeetingModeInfo,
  isFailedTurn,
  formatTurnError,
  boundTurns,
} from '@/lib/office/monitor-transcript'
import { getRoomDisplayLabel, meetingRoomFor } from '@/lib/office/room-routing'

/**
 * Meeting room.
 *
 * Two screens: a LIST of meeting cards and the CREATE form.
 *
 * Every meeting is a CARD, including the one running right now. Nothing expands
 * inline — a live meeting used to render its whole transcript straight into the
 * list, so the list was dominated by the newest meeting and the older ones were
 * pushed off screen. A card opens on click, live or archived.
 */
export default function MeetingPanel({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const agents = useOffice((s) => s.agents)
  const meeting = useOffice((s) => s.meeting)
  const configured = useOffice((s) => s.meetingConfigured)
  const history = useOffice((s) => s.meetingHistory)
  const refresh = useOffice((s) => s.refreshMeeting)

  const [screen, setScreen] = useState<'list' | 'new'>('list')
  const [topic, setTopic] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [moderator, setModerator] = useState('')
  const [meetingMode, setMeetingMode] = useState<'simulasi' | 'a2a'>('simulasi')
  const [busy, setBusy] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  /**
   * Which card is open. A live meeting reads from its in-memory record; an
   * archived one is fetched by id. `kind` decides which.
   */
  const [opened, setOpened] = useState<{ kind: 'live' | 'archive'; id: string } | null>(null)
  const [archive, setArchive] = useState<{ id: string; body: string } | null>(null)
  const [archBusy, setArchBusy] = useState(false)

  /**
   * Follow-up items parsed from the open meeting's minutes, offered as tasks.
   * Loaded per opened meeting, including archived ones — a follow-up from last
   * week's meeting is exactly the thing that still needs doing.
   */
  const [items, setItems] = useState<Candidate[]>([])
  const [roster, setRoster] = useState<string[]>([])
  const [itemsBusy, setItemsBusy] = useState(false)

  // Load the follow-ups whenever an open card has minutes to read from. A meeting
  // that is still running has none yet, so this fires on completion.
  const openId = opened?.id || ''
  const minutesReady = opened
    ? opened.kind === 'live'
      ? !!meeting?.minutes
      : !!archive?.body
    : false
  useEffect(() => {
    if (!openId || !minutesReady) {
      setItems([])
      return
    }
    let alive = true
    setItemsBusy(true)
    fetchJson<{ items?: Candidate[]; roster?: string[] }>(
      `/api/hermes/meeting/actions?from=${encodeURIComponent(openId)}`,
      { cache: 'no-store' },
    )
      .then((res) => {
        if (!alive) return
        // A meeting with no follow-ups is a normal outcome, not an error: the panel
        // simply shows nothing to convert.
        setItems(res.ok ? res.data?.items || [] : [])
        setRoster(res.data?.roster || [])
      })
      .finally(() => alive && setItemsBusy(false))
    return () => {
      alive = false
    }
  }, [openId, minutesReady])

  if (!open) return null

  const live = meeting && (meeting.state === 'queued' || meeting.state === 'running')

  const toggle = (name: string) => {
    setPicked((p) => {
      if (p.includes(name)) {
        const next = p.filter((x) => x !== name)
        if (moderator === name) setModerator(next[0] || '')
        return next
      }
      if (p.length >= 4) return p
      const next = [...p, name]
      if (!moderator) setModerator(name)
      return next
    })
  }

  async function start() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetchJson('/api/hermes/meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, participants: picked, moderator, mode: meetingMode }),
      })
      if (!res.ok) throw new Error(res.error || 'gagal memulai rapat')
      await refresh()
      setTopic('')
      setPicked([])
      setModerator('')
      setScreen('list')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function openArchive(id: string) {
    setArchBusy(true)
    setErr(null)
    setOpened({ kind: 'archive', id })
    setArchive(null)
    try {
      const res = await fetchJson<{ id: string; body: string }>(
        `/api/hermes/meeting?id=${encodeURIComponent(id)}`,
        { cache: 'no-store' },
      )
      if (!res.ok || !res.data) throw new Error(res.error || 'gagal membuka transkrip')
      setArchive({ id: res.data.id, body: res.data.body })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setArchBusy(false)
    }
  }

  function closeCard() {
    setOpened(null)
    setArchive(null)
  }

  /**
   * Batalkan rapat yang sedang berjalan (RAPAT-CANCEL-1). Tombolnya hanya
   * dirender saat `live` — tak ada rapat berjalan = tak ada tombol, tak ada
   * sukses palsu. Arsip DIBATALKAN ditulis runner di batas giliran; refresh
   * berkala mengambil status terbaru.
   */
  async function cancel() {
    if (!meeting) return
    setCancelBusy(true)
    setErr(null)
    try {
      const res = await fetchJson<{ already_cancelled?: boolean; cancel_requested?: boolean }>(
        '/api/hermes/meeting/cancel',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: meeting.id }),
        },
      )
      if (!res.ok) throw new Error(res.error || 'gagal membatalkan rapat')
      await refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setCancelBusy(false)
    }
  }

  function download(name: string, text: string) {
    const blob = new Blob([text], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  /** One card in the list. */
  function Card({
    title,
    meta,
    mode,
    highlight,
    onClick,
    disabled,
  }: {
    title: string
    meta: string
    mode?: string
    highlight?: boolean
    onClick: () => void
    disabled?: boolean
  }) {
    const modeInfo = getMeetingModeInfo(mode)
    return (
      <button
        className={`vp-meeting-row ${highlight ? 'on' : ''}`}
        onClick={onClick}
        disabled={disabled}
      >
        <div className="flex items-center justify-between gap-2 w-full">
          <b>{title}</b>
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${
              modeInfo.isSynthetic
                ? 'bg-amber-950/50 text-amber-300 border border-amber-600/40'
                : 'bg-emerald-950/50 text-emerald-300 border border-emerald-500/40'
            }`}
          >
            {modeInfo.shortBadge}
          </span>
        </div>
        <i>{meta}</i>
      </button>
    )
  }

  const archiveItem = opened?.kind === 'archive' ? history.find((h) => h.id === opened.id) : null
  const archiveModeInfo = getMeetingModeInfo(archiveItem?.mode)
  const liveModeInfo = getMeetingModeInfo(meeting?.mode)
  const boundedTurnsResult = boundTurns(meeting?.turns)

  const agentDivisions = new Map<string, string>()
  for (const a of agents) {
    if (a.division) agentDivisions.set(a.name, a.division)
  }
  let activeRoomLabel = 'Consejo Contexia'
  if (meeting?.participants && meeting.participants.length > 0) {
    try {
      const rId = meetingRoomFor(meeting.participants, agentDivisions)
      activeRoomLabel = getRoomDisplayLabel(rId)
    } catch {
      activeRoomLabel = 'Consejo Contexia'
    }
  }

  let previewRoomLabel = 'Consejo Contexia'
  if (picked.length > 0) {
    try {
      const rId = meetingRoomFor(picked, agentDivisions)
      previewRoomLabel = getRoomDisplayLabel(rId)
    } catch {
      previewRoomLabel = 'Consejo Contexia'
    }
  }

  return (
    <FullPanel
      onClose={onClose}
      label="Sala de reuniones"
      title={screen === 'new' ? 'Nueva reunión' : 'Sala de reuniones'}
      actions={
        screen === 'new' && (
          <button className="vp-chip-btn" onClick={() => setScreen('list')}>
            ← Volver
          </button>
        )
      }
      bodyClassName="vp-pad flex flex-col gap-3"
    >
      {err && <div className="vp-err">{err}</div>}

      {screen === 'list' ? (
        opened ? (
          /* ------------------------------------------------ opened card ---- */
          <>
            <button className="vp-chip-btn" onClick={closeCard}>
              ← Volver a lista
            </button>

            {opened.kind === 'archive' ? (
              archBusy || !archive ? (
                <div className="vp-muted">cargando transcripción…</div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        archiveModeInfo.isSynthetic
                          ? 'bg-amber-950/60 text-amber-300 border border-amber-600/40'
                          : 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      {archiveModeInfo.shortBadge}
                    </span>
                    <span className="text-xs text-slate-300">{archiveModeInfo.fullLabel}</span>
                  </div>

                  <Collapsible
                    label={`Transcripción · ${archive.id}`}
                    text={archive.body}
                    defaultOpen
                  />
                  <button
                    className="vp-btn vp-btn-ghost"
                    onClick={() => download(`reunion-${archive.id}.md`, archive.body)}
                  >
                    Descargar
                  </button>

                  {itemsBusy ? (
                    <div className="vp-muted">leyendo tareas de seguimiento…</div>
                  ) : (
                    <ActionItems
                      candidates={items}
                      roster={roster}
                      origin={{ kind: 'meeting', ref: archive.id }}
                      label="SEGUIMIENTO → TAREAS"
                    />
                  )}
                </>
              )
            ) : !meeting ? (
              <div className="vp-muted">esta reunión ya no está en memoria</div>
            ) : (
              <>
                <div className="vp-kv">
                  <span>tema</span>
                  <b>{meeting.topic || '(sin tema)'}</b>
                </div>
                <div className="vp-kv">
                  <span>sala</span>
                  <b className="text-emerald-400">{activeRoomLabel}</b>
                </div>
                <div className="vp-kv">
                  <span>estado</span>
                  <b>
                    {meeting.state} · {meeting.phase}
                    {live && <span className="vp-live"> ●</span>}
                  </b>
                </div>
                <div className="vp-kv">
                  <span>modo</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${
                        liveModeInfo.isSynthetic
                          ? 'bg-amber-950/60 text-amber-300 border border-amber-600/40'
                          : 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      {liveModeInfo.shortBadge}
                    </span>
                    <b className="text-xs">
                      {liveModeInfo.isSynthetic
                        ? 'Simulación LLM Gateway — habla el modelo central, no los agentes'
                        : liveModeInfo.fullLabel}
                    </b>
                  </div>
                </div>
                <div className="vp-kv">
                  <span>participantes</span>
                  <b>{meeting.participants.join(', ') || '—'}</b>
                </div>
                <div className="vp-kv">
                  <span>turno</span>
                  <b>{meeting.currentSpeaker || '—'}</b>
                </div>

                {live && (
                  <button
                    className="vp-btn vp-btn-warn"
                    disabled={cancelBusy}
                    onClick={cancel}
                  >
                    {cancelBusy ? 'Cancelando…' : 'Cancelar reunión'}
                  </button>
                )}

                <Collapsible
                  label="Transcripción"
                  count={meeting.turns.length}
                  defaultOpen={!!live}
                  empty="belum ada giliran"
                >
                  {boundedTurnsResult.notice && (
                    <div className="text-xs text-amber-300/90 bg-amber-950/40 border border-amber-600/40 rounded px-2.5 py-1 mb-2 font-mono">
                      {boundedTurnsResult.notice}
                    </div>
                  )}
                  <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto overscroll-contain">
                    {boundedTurnsResult.turns.map((t, i) => {
                      const failed = isFailedTurn(t as any)
                      const errMsg = failed ? formatTurnError(t as any) : null
                      return (
                        <div
                          key={i}
                          className={`vp-turn ${
                            failed
                              ? 'border-red-500/60 bg-red-950/30'
                              : t.speaker === meeting.currentSpeaker && live
                              ? 'talk'
                              : ''
                          }`}
                        >
                          <div className="vp-turn-who flex items-center justify-between">
                            <span className="flex items-center gap-2">
                              <span className={failed ? 'text-red-400 font-bold' : ''}>{t.speaker}</span>
                              {failed && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-900/80 text-red-100 border border-red-500/50">
                                  [GAGAL / FAILED]
                                </span>
                              )}
                              <i>
                                {t.kind}
                                {t.round ? ` · r${t.round}` : ''}
                              </i>
                            </span>
                          </div>
                          <div className={`vp-turn-body ${failed ? 'text-red-200' : ''}`}>{t.text}</div>
                          {failed && errMsg && errMsg !== t.text && (
                            <div className="vp-err text-xs text-red-300 font-mono mt-1 pt-1 border-t border-red-500/20">
                              Error: {errMsg}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </Collapsible>

                {meeting.minutes && (
                  <>
                    <Collapsible label="Notulen" text={meeting.minutes} defaultOpen />
                    <button
                      className="vp-btn vp-btn-ghost"
                      onClick={() => download(`notulen-${meeting.id}.md`, meeting.minutes)}
                    >
                      Unduh notulen
                    </button>

                    {/* The cross-menu link: what this meeting asked for, as tasks. */}
                    {itemsBusy ? (
                      <div className="vp-muted">membaca tindak lanjut…</div>
                    ) : (
                      <ActionItems
                        candidates={items}
                        roster={roster}
                        origin={{ kind: 'meeting', ref: meeting.id }}
                        label="TINDAK LANJUT → TUGAS"
                      />
                    )}
                  </>
                )}
              </>
            )}
          </>
        ) : (
          /* ------------------------------------------------ the list ------ */
          <>
            <button className="vp-btn" onClick={() => setScreen('new')}>
              + Iniciar nueva reunión
            </button>
            {!configured && (
              <div className="vp-note">
                Modelo LLM no configurado — configure <code>AI_BASE_URL</code> y <code>AI_API_KEY</code> para debates automáticos.
              </div>
            )}

            {meeting && (
              <>
                <div className="vp-sub">
                  REUNIÓN ACTIVA {live && <span className="vp-live">●</span>}
                </div>
                <Card
                  title={meeting.topic || '(sin tema)'}
                  meta={`${meeting.state} · ${meeting.participants.length} participantes · ${meeting.turns.length} turnos`}
                  mode={meeting.mode}
                  highlight={!!live}
                  onClick={() => setOpened({ kind: 'live', id: meeting.id })}
                />
              </>
            )}

            <div className="vp-sub">REUNIONES ANTERIORES ({history.length})</div>
            <div className="flex flex-col gap-2">
              {history.map((h) => (
                <Card
                  key={h.id}
                  title={h.topic}
                  meta={`${h.startedAt} · ${h.participants.length || '?'} participantes · ${h.turnCount} turnos`}
                  mode={h.mode}
                  disabled={archBusy}
                  onClick={() => openArchive(h.id)}
                />
              ))}
              {!history.length && (
                <span className="vp-muted">No hay reuniones registradas</span>
              )}
            </div>
          </>
        )
      ) : (
        /* ---------------------------------------------------- create form -- */
        <>
          <label className="vp-sub">TOPIK</label>
          <textarea
            className="vp-input"
            rows={2}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Rencana rilis endpoint refund"
          />

          <label className="vp-sub">PESERTA (2–4) · {agents.length} agent aktif</label>
          <div className="flex flex-wrap gap-2">
            {agents.map((a) => (
              <button
                key={a.name}
                className={`vp-chip-btn ${picked.includes(a.name) ? 'on' : ''}`}
                onClick={() => toggle(a.name)}
              >
                {a.displayName}
                <i className="vp-chip-role">{a.status}</i>
              </button>
            ))}
            {!agents.length && <span className="vp-muted">sin agentes activos aún</span>}
          </div>

          {picked.length >= 2 && (
            <div className="vp-kv">
              <span>sala de juntas</span>
              <b className="text-emerald-400">{previewRoomLabel}</b>
            </div>
          )}

          <label className="vp-sub">MODERADOR</label>
          <select
            className="vp-input"
            value={moderator}
            onChange={(e) => setModerator(e.target.value)}
          >
            {picked.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {/* Invariant tested by selftest: MODE RAPAT */}
          <label className="vp-sub">MODO DE REUNIÓN</label>
          <div className="flex flex-col gap-2">
            <label className="vp-kv">
              <input
                type="radio"
                name="meeting-mode"
                checked={meetingMode === 'simulasi'}
                onChange={() => setMeetingMode('simulasi')}
              />
              <span>
                {/* Invariant tested by selftest: BUKAN agent */}
                <b>Simulación</b> — habla el modelo central de la oficina.
              </span>
            </label>
            <label className="vp-kv">
              <input
                type="radio"
                name="meeting-mode"
                checked={meetingMode === 'a2a'}
                onChange={() => setMeetingMode('a2a')}
              />
              <span>
                <b>A2A</b> — hablan los agentes reales mediante protocolo A2A.
              </span>
            </label>
          </div>

          <button
            className="vp-btn"
            disabled={busy || !topic.trim() || picked.length < 2 || !configured}
            onClick={start}
          >
            {busy ? 'Iniciando…' : 'Iniciar reunión'}
          </button>
          {picked.length < 2 && <div className="vp-muted">selecciona al menos 2 participantes</div>}
        </>
      )}
    </FullPanel>
  )
}
