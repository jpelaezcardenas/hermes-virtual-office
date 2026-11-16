'use client'

import { useState } from 'react'
import { useOffice } from '@/lib/store'
import { fetchJson } from '@/lib/api'

type BlueprintItem = {
  title: string
  assignee: string
  body: string
  priority: number
}

type TaskBlueprint = {
  id: string
  label: string
  ref: string
  description: string
  items: BlueprintItem[]
}

const CONTEXIA_BLUEPRINTS: readonly TaskBlueprint[] = [
  {
    id: 'captacion-e2e',
    label: 'Blueprint 1 — Encargo de Captación E2E (Vera → Mateo → Carmen)',
    ref: 'blueprint-captacion-e2e',
    description: 'Diagnóstico pasivo de prospecto, redacción con tacto y consolidación HITL.',
    items: [
      {
        title: '1/3 Escaneo pasivo y priorización (<10 min) de prospecto',
        assignee: 'centinela',
        body: 'Leer ~/.hermes/shared/oficina/auditoria/prospecto/ (solo datos públicos, sin intrusión), enmascarar IPs/correos y entregar informe priorizado (<10 min) + aviso con tacto para @social-ops.',
        priority: 2,
      },
      {
        title: '2/3 Propuesta y correo corto con regalo de valor (Mateo + Sell Machine)',
        assignee: 'social-ops',
        body: 'Tomar el diagnóstico pasivo de Centinela, enriquecer datos públicos (company_research read-only) y redactar correo corto como regalo de valor proponiendo llamada, sin enviar ni prometer ahorro garantizado.',
        priority: 2,
      },
      {
        title: '3/3 Consolidar y Revisar entrega en /entregas + Gate HITL',
        assignee: 'orchestrator',
        body: 'Consolidar resultado en ~/.hermes/shared/oficina/entregas/, verificar cifras, nombres y piso >= $1.490.000 COP/mes (cero Pro Micro) y bloquear en Approval Queue con resumen de 3 líneas para @user.',
        priority: 1,
      },
    ],
  },
  {
    id: 'cuadre-ramon',
    label: 'Blueprint 2 — Cuadre Rápido de Facturas y Banco (Módulo Ramón)',
    ref: 'blueprint-cuadre-ramon',
    description: 'Prioridad cobros vencidos >30d, cruce CSV/PDF en solo lectura y consolidación.',
    items: [
      {
        title: '1/3 Cuadre urgente (>30 días vencidos, vencimientos semana y CSV banco)',
        assignee: 'pulso',
        body: 'Abrir en primera línea con cobros vencidos >30 días y vencimientos de esta semana; cruzar movimientos_banco.csv en ~/.hermes/shared/oficina/facturas/ con Caja Real (Cuenta 1110). Solo lectura.',
        priority: 2,
      },
      {
        title: '2/3 Validación documental PDF y partidas huérfanas (R1/R2/R3)',
        assignee: 'auditoria',
        body: 'Contrastar PDFs en ~/.hermes/shared/oficina/facturas/ citando archivo fuente exacto (sin inventar datos si hay PDFs ilegibles) y clasificar observaciones para revisión de Entidad A.',
        priority: 2,
      },
      {
        title: '3/3 Consolidar informe financiero en /entregas para revisión',
        assignee: 'orchestrator',
        body: 'Consolidar el cuadre de Pulso y Auditoría en ~/.hermes/shared/oficina/entregas/ y escalar hallazgos críticos o ajustes sugeridos a Approval Queue / Tatiana Barbosa (Entidad A).',
        priority: 1,
      },
    ],
  },
  {
    id: 'campana-reels-sell-machine',
    label: 'Blueprint 3 — Campaña Social Media OPs & Reels (Lucía + Sell Machine)',
    ref: 'blueprint-social-sell-machine',
    description: 'Señales de mercado, guion Reel 20-45s (2 hooks) + evaluación HITL.',
    items: [
      {
        title: '1/3 Señales de demanda y unit economics COD (Apify / Windsor AI)',
        assignee: 'radar',
        body: 'Aportar señales recientes de demanda e-commerce/dropshipping COD, métricas CPA Real/ROAS y dolores validados para alimentar el sprint creativo.',
        priority: 2,
      },
      {
        title: '2/3 Guion Reel 20-45s (2 hooks) + lote Sell Machine',
        assignee: 'social-ops',
        body: 'Generar guion de Reel (20-45s autocontenido, frase entrada/salida, 2 hooks alternativos, corte/rótulos y marcador [DATO] si falta cifra) + hooks evaluados en Sell Machine (60/25/15).',
        priority: 2,
      },
      {
        title: '3/3 Validación Claim Ledger, piso oficial y Gate HITL',
        assignee: 'approval-queue',
        body: 'Verificar cero frases prohibidas, cero claims de multas/ahorro garantizado, piso Contexia Pro >= $1.490.000 COP/mes (sin Pro Micro) y dejar en PENDING para @user.',
        priority: 1,
      },
    ],
  },
]

type BatchResponse = {
  success: boolean
  created?: { id: string; title: string; assignee: string }[]
  failed?: { title: string; error: string }[]
}

/** Dispatch a new task (or multi-agent Contexia Blueprint) straight into the Hermes board. */
export default function NewTaskDialog() {
  const open = useOffice((s) => s.newTaskOpen)
  const setOpen = useOffice((s) => s.setNewTaskOpen)
  const agents = useOffice((s) => s.agents)
  const load = useOffice((s) => s.load)

  const [blueprintId, setBlueprintId] = useState<string>('custom')
  const [blueprintTarget, setBlueprintTarget] = useState('')
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [body, setBody] = useState('')
  const [priority, setPriority] = useState(0)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  if (!open) return null

  const selectedBlueprint = CONTEXIA_BLUEPRINTS.find((b) => b.id === blueprintId) ?? null
  const canSubmit = selectedBlueprint ? !busy : !busy && Boolean(title.trim())

  async function submit() {
    setBusy(true)
    setNote(null)
    try {
      if (selectedBlueprint) {
        const extra = blueprintTarget.trim()
        const items = selectedBlueprint.items.map((item) => ({
          ...item,
          body: extra ? `Objetivo / Contexto: ${extra}\n\n${item.body}` : item.body,
        }))
        const res = await fetchJson<BatchResponse>('/api/hermes/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            origin: { kind: 'manual', ref: selectedBlueprint.ref },
            items,
          }),
        })
        if (!res.ok || !res.data?.created?.length) {
          throw new Error(res.error || 'error al crear las tareas del blueprint')
        }
        const failCount = res.data.failed?.length ?? 0
        const summary = res.data.created.map((t) => t.assignee).join(' → ')
        setNote(
          failCount > 0
            ? `Creadas ${res.data.created.length} tareas (${summary}); ${failCount} con error.`
            : `Blueprint despachado (${res.data.created.length} tarjetas): ${summary}`,
        )
        setBlueprintTarget('')
        await load()
        setTimeout(() => setOpen(false), 1100)
        return
      }

      const res = await fetchJson<{ task: { id: string } }>('/api/hermes/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          assignee: assignee || agents[0]?.name,
          body,
          priority,
        }),
      })
      if (!res.ok || !res.data) throw new Error(res.error || 'error al crear tarea')
      setNote(`Creado: ${res.data.task.id}`)
      setTitle('')
      setBody('')
      await load()
      setTimeout(() => setOpen(false), 900)
    } catch (e) {
      setNote(`Error: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="vp-modal-backdrop" onClick={() => setOpen(false)}>
      <div className="vp-modal" onClick={(e) => e.stopPropagation()}>
        <header className="vp-panel-head">
          <h2>Nueva tarea</h2>
          <button className="vp-x" onClick={() => setOpen(false)} aria-label="Cerrar">×</button>
        </header>
        <div className="vp-pad flex flex-col gap-3">
          <label className="vp-sub">PLANTILLAS MULTI-AGENTE CONTEXIA (BLUEPRINTS)</label>
          <select
            className="vp-input"
            value={blueprintId}
            onChange={(e) => {
              setBlueprintId(e.target.value)
              setNote(null)
            }}
          >
            <option value="custom">Personalizada (1 tarea individual)</option>
            {CONTEXIA_BLUEPRINTS.map((bp) => (
              <option key={bp.id} value={bp.id}>{bp.label}</option>
            ))}
          </select>

          {selectedBlueprint ? (
            <>
              <p className="text-xs text-slate-300">{selectedBlueprint.description}</p>
              <label className="vp-sub">PROSPECTO, ARCHIVO O CAMPAÑA OBJETIVO (OPCIONAL)</label>
              <input
                className="vp-input"
                value={blueprintTarget}
                onChange={(e) => setBlueprintTarget(e.target.value)}
                placeholder="ej: Tienda Demo COD Colombia S.A.S. (Laura Gómez)"
              />
              <div className="flex flex-col gap-1.5 rounded-lg border border-white/10 bg-black/25 p-2.5 text-xs">
                <span className="vp-sub">FLUJO EN TABLERO ({selectedBlueprint.items.length} TARJETAS)</span>
                {selectedBlueprint.items.map((item) => (
                  <div key={item.title} className="flex items-start gap-2 text-slate-200">
                    <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-[#2DD4BF]">
                      @{item.assignee}
                    </span>
                    <span>{item.title}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <label className="vp-sub">TÍTULO</label>
              <input
                className="vp-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ej: Conciliación bancaria mensual"
              />

              <label className="vp-sub">RESPONSABLE / ASIGNADO A</label>
              <select
                className="vp-input"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
              >
                {agents.map((a) => (
                  <option key={a.name} value={a.name}>{a.displayName}</option>
                ))}
              </select>

              <label className="vp-sub">DETALLES (OPCIONAL)</label>
              <textarea
                className="vp-input"
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Contexto, alcance o criterios de aceptación..."
              />

              <label className="vp-sub">PRIORIDAD</label>
              <input
                className="vp-input"
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
              />
            </>
          )}

          <button className="vp-btn" disabled={!canSubmit} onClick={submit}>
            {busy
              ? 'Enviando…'
              : selectedBlueprint
                ? `Despachar Blueprint (${selectedBlueprint.items.length} tarjetas)`
                : 'Enviar a la cola'}
          </button>
          {note && <div className="vp-note">{note}</div>}
        </div>
      </div>
    </div>
  )
}
