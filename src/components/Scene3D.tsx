'use client'

import { useEffect, useRef, useState } from 'react'
import { createScene, type OfficeScene } from '@/lib/office/scene'
import { useOffice } from '@/lib/store'
import { isWebGLAvailable, WEBGL_UNAVAILABLE_BANNER } from '@/lib/office/accessibility'
import type { AgentDivision } from '@/types/hermes'

type Props = {
  onScene: (s: OfficeScene | null) => void
  /** A dummy avatar was clicked — the panel offers to spawn a real agent. */
  onDummy: (avatarId: string, division: AgentDivision) => void
  /** The green whiteboard was clicked — open the full Kanban modal. */
  onBoard: () => void
  /** The office name plate was clicked — open the rename field. */
  onName: () => void
}

export default function Scene3D({ onScene, onDummy, onBoard, onName }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<OfficeScene | null>(null)
  const [webglError, setWebglError] = useState<string | null>(null)

  const agents = useOffice((s) => s.agents)
  const avatars = useOffice((s) => s.avatars)
  const tasks = useOffice((s) => s.tasks)
  const meeting = useOffice((s) => s.meeting)
  const view = useOffice((s) => s.view)
  const setView = useOffice((s) => s.setView)
  const health = useOffice((s) => s.health)
  const work = useOffice((s) => s.work)
  const setPeek = useOffice((s) => s.setPeek)
  const select = useOffice((s) => s.select)
  const openTask = useOffice((s) => s.openTask)
  const saveAvatars = useOffice((s) => s.saveAvatars)

  // Handlers live in a ref so the scene is created ONCE but always calls the
  // latest callback — recreating the WebGL context on every render is not an
  // option, and a stale closure here means a click that does nothing.
  const cb = useRef({ onDummy, onBoard, onName, openTask, setPeek, select, saveAvatars })
  cb.current = { onDummy, onBoard, onName, openTask, setPeek, select, saveAvatars }

  useEffect(() => {
    if (!canvasRef.current || !labelRef.current) return

    if (!isWebGLAvailable()) {
      setWebglError(WEBGL_UNAVAILABLE_BANNER)
      onScene(null)
      return
    }

    let scene: OfficeScene | null = null
    let ro: ResizeObserver | null = null

    try {
      scene = createScene(canvasRef.current, labelRef.current, {
        onMonitorClick: (desk) => cb.current.setPeek(desk),
        onAvatarClick: (name) => cb.current.select(name),
        onTaskClick: (taskId) => cb.current.openTask(taskId),
        onDummyClick: (avatarId, division) => cb.current.onDummy(avatarId, division),
        onBoardClick: () => cb.current.onBoard(),
        onNameClick: () => cb.current.onName(),
        onSaveAvatars: (list) => void cb.current.saveAvatars(list),
      })
      sceneRef.current = scene
      onScene(scene)
      if (process.env.NEXT_PUBLIC_E2E_HOOK === '1') {
        ;(window as unknown as { __office?: OfficeScene }).__office = scene
      }
      scene.start()

      const parent = canvasRef.current.parentElement
      if (parent) {
        ro = new ResizeObserver(() => scene?.resize(parent.clientWidth, parent.clientHeight))
        ro.observe(parent)
        scene.resize(parent.clientWidth, parent.clientHeight)
      }
    } catch (err) {
      console.error('Failed to initialize 3D scene:', err)
      setWebglError(WEBGL_UNAVAILABLE_BANNER)
      onScene(null)
      return
    }

    return () => {
      ro?.disconnect()
      scene?.dispose()
      sceneRef.current = null
      onScene(null)
    }
    // deliberately once: the scene outlives individual state updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Avatars come from the DB (dummies included) and the roster decides which of
  // them are real agents. Both feed one reconcile so a name can never be drawn
  // twice.
  useEffect(() => {
    sceneRef.current?.syncAvatars(avatars, agents)
  }, [avatars, agents])

  useEffect(() => {
    sceneRef.current?.setTasks(tasks)
  }, [tasks])

  useEffect(() => {
    sceneRef.current?.setMeeting(meeting)
  }, [meeting])

  // Chat hidup / cron baru jalan: agent ditarik ke mejanya (lihat office/duty.ts).
  useEffect(() => {
    sceneRef.current?.setWork(work)
  }, [work])

  useEffect(() => {
    if (view === '3d') sceneRef.current?.start()
    else sceneRef.current?.stop()
  }, [view])

  // Hidden tab handling: pause render loop when document is hidden to conserve resources
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (typeof document === 'undefined') return
      if (document.hidden) {
        sceneRef.current?.stop()
      } else if (view === '3d') {
        sceneRef.current?.start()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [view])

  // Lampu kesehatan di lobby. Ini yang membuat kantornya SENDIRI yang memberi tahu, bukan
  // menunggu ada yang membuka panel.
  useEffect(() => {
    sceneRef.current?.setHealth(health.level)
  }, [health])

  // relay new meeting turns into speech bubbles
  const said = useRef(0)
  useEffect(() => {
    const s = sceneRef.current
    if (!s || !meeting) return
    const turns = meeting.turns || []
    for (let i = said.current; i < turns.length; i++) {
      const t = turns[i]
      if (t.kind === 'minutes') {
        s.say(meeting.moderator, 'notulen siap — lihat panel')
      } else {
        const label = t.kind === 'opening' ? 'membuka rapat' : t.text.slice(0, 140)
        s.say(t.speaker, label, 9000)
      }
    }
    said.current = turns.length
    if (!turns.length) said.current = 0
  }, [meeting])

  if (webglError) {
    return (
      <div
        className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-[#0f1418] text-center"
        role="alert"
        data-testid="webgl-fallback-banner"
      >
        <div className="max-w-md p-6 rounded-2xl bg-[#131b21] border border-[#26333d] shadow-2xl flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 text-xl font-bold select-none">
            !
          </div>
          <div className="text-base font-semibold text-[#e1e7ec]">
            {webglError}
          </div>
          <p className="text-xs text-[#8fa2ae]">
            Semua panel operasional (Kanban, log pemantau, rapat, dan persetujuan) tetap berfungsi penuh.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
            <button
              type="button"
              className="px-4 py-2 text-sm font-medium rounded-lg bg-[#1f6feb] hover:bg-[#388bfd] text-white transition-colors cursor-pointer"
              onClick={() => setView('2d')}
            >
              Buka Kanban 2D
            </button>
            <button
              type="button"
              className="px-4 py-2 text-sm font-medium rounded-lg bg-[#21262d] hover:bg-[#30363d] text-[#e1e7ec] border border-[#30363d] transition-colors cursor-pointer"
              onClick={() => setView('sprite')}
            >
              Buka Sprite
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute inset-0">
      {/* touch-none: tanpa ini, menyeret jari di HP men-scroll halaman, bukan memutar kamera. */}
      <canvas ref={canvasRef} className="block h-full w-full touch-none" />
      <div ref={labelRef} className="pointer-events-none absolute inset-0" />
    </div>
  )
}
