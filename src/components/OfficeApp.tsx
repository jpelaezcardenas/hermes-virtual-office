'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Kanban2D from './Kanban2D'
import SpriteOffice from './SpriteOffice'
import PeekPanel from './PeekPanel'
import TaskPanel from './TaskPanel'
import MeetingPanel from './MeetingPanel'
import AgentSpawnPanel from './AgentSpawnPanel'
import CronPanel from './CronPanel'
import SystemPanel from './SystemPanel'
import BoardPanel from './BoardPanel'
import ChatPanel from './ChatPanel'
import ApprovalConflictPanel from './ApprovalConflictPanel'
import NewTaskDialog from './NewTaskDialog'
import KanbanModal from './KanbanModal'
import DummySpawnDialog from './DummySpawnDialog'
import OfficeNameDialog from './OfficeNameDialog'
import { startPolling, useOffice } from '@/lib/store'
import { isDemoMode } from '@/lib/office/mode'
import type { CameraPresetId } from '@/lib/office/camera'
import type { OfficeScene } from '@/lib/office/scene'
import type { AgentDivision } from '@/types/hermes'

/**
 * The 3D scene is the only consumer of three.js, which is the bulk of this app's
 * JavaScript. Loading it lazily means a visitor who stays on Kanban or Sprite
 * never downloads it — measured on the route: 278 kB before, 175 kB after the
 * scene moved out of the initial bundle.
 */
const Scene3D = dynamic(() => import('./Scene3D'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center vp-muted">Cargando oficina…</div>,
})

export default function OfficeApp() {
  const view = useOffice((s) => s.view)
  const setView = useOffice((s) => s.setView)
  const setNewTaskOpen = useOffice((s) => s.setNewTaskOpen)
  const tasks = useOffice((s) => s.tasks)
  const agents = useOffice((s) => s.agents)
  const error = useOffice((s) => s.error)
  const meeting = useOffice((s) => s.meeting)
  const select = useOffice((s) => s.select)
  const selected = useOffice((s) => s.selectedAgent)
  const loadTasks = useOffice((s) => s.load)

  const sceneRef = useRef<OfficeScene | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLElement>(null)
  const [meetOpen, setMeetOpen] = useState(false)
  const [agentOpen, setAgentOpen] = useState(false)
  const [cronOpen, setCronOpen] = useState(false)
  const [systemOpen, setSystemOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [approvalOpen, setApprovalOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [boardOpen, setBoardOpen] = useState(false)
  const [nameOpen, setNameOpen] = useState(false)
  const [activePreset, setActivePreset] = useState<CameraPresetId>('overall')

  const handleCameraPreset = (presetId: CameraPresetId) => {
    setActivePreset(presetId)
    if (sceneRef.current) {
      sceneRef.current.applyCameraPreset(presetId, true)
    }
  }
  /** Slot of a dummy avatar that was clicked, if any. */
  const [spawnSlot, setSpawnSlot] = useState<{ avatarId: string; division: AgentDivision } | null>(null)
  const loadOffice = useOffice((s) => s.loadOffice)

  useEffect(() => startPolling(), [])

  // Tinggi top bar TIDAK tetap: di layar sempit tombolnya pindah ke baris kedua, dan
  // angka status berubah panjang. Diukur langsung lalu diberikan ke CSS, supaya
  // kanvas dan panel samping mulai tepat di bawahnya alih-alih menebak 58px.
  useEffect(() => {
    const bar = barRef.current
    const root = rootRef.current
    if (!bar || !root) return
    const ro = new ResizeObserver(() => root.style.setProperty('--vp-topbar-h', `${bar.offsetHeight}px`))
    ro.observe(bar)
    return () => ro.disconnect()
  }, [])

  // request browser notification permission once, then alert on review/blocked
  const seen = useRef<Map<string, string>>(new Map())
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission()
    }
  }, [])
  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    for (const t of tasks) {
      const prev = seen.current.get(t.id)
      if (prev && prev !== t.status && (t.status === 'review' || t.status === 'blocked')) {
        new Notification(`Kanban · ${t.status}`, { body: t.title })
      }
      seen.current.set(t.id, t.status)
    }
  }, [tasks])

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return

      if (e.key === 'Escape') {
        select(null)
        setMeetOpen(false)
        setChatOpen(false)
        setApprovalOpen(false)
        setPanelOpen(false)
        setSystemOpen(false)
        setAgentOpen(false)
        setCronOpen(false)
        setBoardOpen(false)
        setNameOpen(false)
        setSpawnSlot(null)
        return
      }

      if (e.key === 'm' || e.key === 'M') setMeetOpen((v) => !v)
      if (e.key === 'n' || e.key === 'N') setNewTaskOpen(true)
      if (e.key === 'c' || e.key === 'C') setChatOpen((v) => !v)
      if (e.key === 'p' || e.key === 'P') setApprovalOpen((v) => !v)
      if (e.key === 'b' || e.key === 'B') setPanelOpen((v) => !v)
      if (e.key === 's' || e.key === 'S') setSystemOpen((v) => !v)
      if (e.key === '3') setView('3d')
      if (e.key === '2') setView('2d')
      if (e.key === '1') setView('sprite')
      if (e.key === '4') handleCameraPreset('overall')
      if (e.key === '5') handleCameraPreset('courtyard')
      if (e.key === '6') handleCameraPreset('lounge')
      if (e.key === '7') handleCameraPreset('upper-floor')
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [setView, setNewTaskOpen, select])

  const backendOnline = !error
  // Archived tasks are on the board (the 2D view has an ARSIP column) but they
  // are not progress: counting them would deflate the release figure.
  const live = tasks.filter((t) => t.status !== 'archived')
  const running = live.filter((t) => t.status === 'running').length
  const done = live.filter((t) => t.status === 'done').length
  const pct = live.length ? Math.round((done / live.length) * 100) : 0

  return (
    <div ref={rootRef} className="relative h-dvh w-full overflow-hidden bg-[#0f1418]">
      <main className="vp-stage">
        {view === '3d' ? (
          <Scene3D
            onScene={(s) => {
              sceneRef.current = s
              if (s && activePreset !== 'overall') {
                s.applyCameraPreset(activePreset, false)
              }
            }}
            onDummy={(avatarId, division) => setSpawnSlot({ avatarId, division })}
            onBoard={() => setBoardOpen(true)}
            onName={() => setNameOpen(true)}
          />
        ) : view === 'sprite' ? (
          <SpriteOffice onSelect={select} />
        ) : (
          <Kanban2D />
        )}
      </main>

      {/* ------------------------------------------------------- camera preset selector */}
      {view === '3d' && (
        <aside
          className="absolute bottom-4 left-4 z-20 flex flex-col gap-1.5 p-2 rounded-xl bg-[#131b21ee] border border-[#26333d] shadow-lg backdrop-blur-md max-w-[calc(100vw-2rem)] overflow-x-auto"
          aria-label="Vistas de Cámara"
        >
          <div className="flex items-center justify-between px-1 text-[11px] font-semibold tracking-wider uppercase text-[#8fa2ae]">
            <span>Ángulo de Visión</span>
            <span className="text-[10px] text-[#8fa2ae]/70 font-mono">4-7</span>
          </div>
          <div className="vp-seg flex overflow-x-auto min-h-[44px] items-center" role="toolbar" aria-label="Selección de Vista de Cámara">
            <button
              type="button"
              className={`min-h-[40px] min-w-[44px] px-3 py-2 text-xs font-medium cursor-pointer ${activePreset === 'overall' ? 'on' : ''}`}
              onClick={() => handleCameraPreset('overall')}
              title="Oficina General (Tecla 4)"
              aria-pressed={activePreset === 'overall'}
            >
              General
            </button>
            <button
              type="button"
              className={`min-h-[40px] min-w-[44px] px-3 py-2 text-xs font-medium cursor-pointer ${activePreset === 'courtyard' ? 'on' : ''}`}
              onClick={() => handleCameraPreset('courtyard')}
              title="Patio & Piscina (Tecla 5)"
              aria-pressed={activePreset === 'courtyard'}
            >
              Patio
            </button>
            <button
              type="button"
              className={`min-h-[40px] min-w-[44px] px-3 py-2 text-xs font-medium cursor-pointer ${activePreset === 'lounge' ? 'on' : ''}`}
              onClick={() => handleCameraPreset('lounge')}
              title="Sala / Lounge (Tecla 6)"
              aria-pressed={activePreset === 'lounge'}
            >
              Lounge
            </button>
            <button
              type="button"
              className={`min-h-[40px] min-w-[44px] px-3 py-2 text-xs font-medium cursor-pointer ${activePreset === 'upper-floor' ? 'on' : ''}`}
              onClick={() => handleCameraPreset('upper-floor')}
              title="Piso Superior & CEO (Tecla 7)"
              aria-pressed={activePreset === 'upper-floor'}
            >
              Piso Superior
            </button>
          </div>
        </aside>
      )}

      {/* ------------------------------------------------------- top bar */}
      <header ref={barRef} className="vp-topbar">
        {/* Hidden per user request: "elimina esto" */}
        <div className="hidden" aria-hidden="true">
          <span className="vp-logo">Hermes Office</span>
          {isDemoMode() && (
            <span
              data-testid="office-demo-badge"
              className="px-2 py-0.5 text-xs font-bold uppercase tracking-wider rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 select-none"
            >
              DEMO
            </span>
          )}
          <span className={`vp-dot ${backendOnline ? 'ok' : 'bad'}`} />
          <span className="vp-muted vp-topbar-status">
            {backendOnline ? `${agents.length} agentes · ${running} activos · ${pct}% completado` : 'backend offline'}
          </span>
        </div>

        <nav className="vp-topbar-nav flex items-center gap-2" aria-label="Panel">
          <button className="vp-btn vp-btn-ghost" onClick={() => setNewTaskOpen(true)}>+ Tarea</button>
          <button className="vp-btn vp-btn-ghost" onClick={() => setMeetOpen(true)}>
            Reunión{meeting && meeting.state === 'running' ? ' ●' : ''}
          </button>
          <button className="vp-btn vp-btn-ghost" onClick={() => setAgentOpen(true)}>
            Agentes ({agents.length})
          </button>
          <button className="vp-btn vp-btn-ghost" onClick={() => setCronOpen(true)}>
            Cron
          </button>
          <button className="vp-btn vp-btn-ghost" onClick={() => setApprovalOpen(true)}>
            Aprobaciones
          </button>
          <button className="vp-btn vp-btn-ghost" onClick={() => setPanelOpen(true)}>
            Tablero
          </button>
          <button className="vp-btn vp-btn-ghost" onClick={() => setSystemOpen(true)}>
            Sistema
          </button>
          <button className="vp-btn vp-btn-ghost" onClick={() => setChatOpen(true)}>
            Chat
          </button>
        </nav>

        {/* View switcher and Fullscreen button arranged neatly side-by-side in top-right */}
        <div className="vp-topbar-view flex items-center gap-2.5">
          <div className={`vp-seg ${view === 'sprite' ? 'vp-sprite-toggle' : ''}`}>
            <button className={view === '3d' ? 'on' : ''} onClick={() => setView('3d')}>3D</button>
            <button className={view === '2d' ? 'on' : ''} onClick={() => setView('2d')}>Kanban</button>
            <button className={view === 'sprite' ? 'on' : ''} onClick={() => setView('sprite')}>Sprite</button>
          </div>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen().catch(() => {
                    window.open('https://office.contexia.online', '_blank', 'noopener,noreferrer')
                  })
                } else {
                  document.exitFullscreen()
                }
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 hover:border-[#2DD4BF]/50 text-xs font-semibold text-slate-200 transition active:scale-95 cursor-pointer"
            title="Pantalla Completa"
          >
            <span className="material-symbols-outlined text-[15px] text-[#2DD4BF]">fullscreen</span>
            <span>Pantalla Completa</span>
          </button>
        </div>
      </header>

      {/* ------------------------------------------------------- agent card */}
      {selected && (() => {
        const a = agents.find((x) => x.name === selected)
        const t = tasks.find((x) => x.id === a?.currentTaskId)
        if (!a) return null
        return (
          <aside className="vp-card-float">
            <div className="flex items-center justify-between">
              <b>{a.displayName}</b>
              <button className="vp-x" onClick={() => select(null)} aria-label="Cerrar">×</button>
            </div>
            <div className="vp-kv"><span>Rol</span><b>{a.role}</b></div>
            <div className="vp-kv"><span>Estado</span><b>{a.status}</b></div>
            <div className="vp-kv"><span>Tarea</span><b>{t?.title || '—'}</b></div>
          </aside>
        )
      })()}


      <TaskPanel />
      <PeekPanel />
      <MeetingPanel open={meetOpen} onClose={() => setMeetOpen(false)} />
      <AgentSpawnPanel
        open={agentOpen}
        onClose={() => setAgentOpen(false)}
        onChanged={() => void loadTasks()}
      />
      <CronPanel open={cronOpen} onClose={() => setCronOpen(false)} />
      <BoardPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
      <ApprovalConflictPanel open={approvalOpen} onClose={() => setApprovalOpen(false)} />
      <SystemPanel open={systemOpen} onClose={() => setSystemOpen(false)} />
      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onAgentCreated={() => void loadTasks()}
      />
      <NewTaskDialog />
      {boardOpen && <KanbanModal onClose={() => setBoardOpen(false)} />}
      {nameOpen && <OfficeNameDialog onClose={() => setNameOpen(false)} />}
      {spawnSlot && (
        <DummySpawnDialog
          avatarId={spawnSlot.avatarId}
          division={spawnSlot.division}
          onClose={() => {
            setSpawnSlot(null)
            void loadOffice()
          }}
        />
      )}

      {error && (
        <div className="vp-banner" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
