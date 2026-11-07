'use client'

import { useState } from 'react'
import FullPanel from './FullPanel'
import {
  ApprovalDomain,
  ApprovalProposal,
  CrmConflictItem,
  DOMAIN_BADGES,
  INITIAL_CONFLICTS,
  INITIAL_PROPOSALS,
  UserContext,
  canUserDecideDomain,
  decideProposal,
  resolveCrmConflict,
} from '@/lib/office/approval-conflict'

interface ApprovalConflictPanelProps {
  open: boolean
  onClose: () => void
}

const PRESET_CALLERS: UserContext[] = [
  { id: 'usr-admin', name: 'Administrador / Founder (Contexia)', kind: 'human', role: 'admin' },
  { id: 'usr-accountant', name: 'Taty (Contadora / Centinela Fiscal)', kind: 'human', role: 'accountant' },
  { id: 'usr-treasury', name: 'Tesorería (Caja Real / Pagos)', kind: 'human', role: 'treasury' },
  { id: 'usr-sales-mgr', name: 'Gerente Comercial (CRM & Leads)', kind: 'human', role: 'sales_manager' },
  { id: 'usr-marketing', name: 'Líder de Marketing (Campañas)', kind: 'human', role: 'marketing_lead' },
  { id: 'usr-operator', name: 'Operador General', kind: 'human', role: 'operator' },
  { id: 'agent-manus', name: 'Manus (Agente Automatizado)', kind: 'agent', role: 'manus' },
  { id: 'agent-codex', name: 'Codex (Agente CLI)', kind: 'agent', role: 'codex' },
]

export default function ApprovalConflictPanel({ open, onClose }: ApprovalConflictPanelProps) {
  const [caller, setCaller] = useState<UserContext>(PRESET_CALLERS[0])
  const [tab, setTab] = useState<'all' | ApprovalDomain>('all')
  const [proposals, setProposals] = useState<ApprovalProposal[]>(INITIAL_PROPOSALS)
  const [conflicts, setConflicts] = useState<CrmConflictItem[]>(INITIAL_CONFLICTS)
  const [notification, setNotification] = useState<{ type: 'ok' | 'err'; message: string } | null>(null)
  const [staleSimulations, setStaleSimulations] = useState<Record<string, boolean>>({})

  if (!open) return null

  const pendingProposalsCount = proposals.filter((p) => p.status === 'pending').length
  const unresolvedConflictsCount = conflicts.filter((c) => c.status === 'unresolved').length
  const totalPending = pendingProposalsCount + unresolvedConflictsCount

  const handleDecideProposal = (proposal: ApprovalProposal, decision: 'APPROVED' | 'REJECTED') => {
    setNotification(null)
    const isStale = staleSimulations[proposal.id] ?? false
    const expectedRevision = isStale ? proposal.revision - 1 : proposal.revision

    const result = decideProposal(
      proposal,
      decision,
      caller,
      expectedRevision,
      `Decisión por ${caller.name} vía Panel de Control`,
    )

    if (result.success && result.proposal) {
      setProposals((prev) => prev.map((p) => (p.id === proposal.id ? result.proposal! : p)))
      setNotification({
        type: 'ok',
        message: `Propuesta '${proposal.title}' ${decision === 'APPROVED' ? 'aprobada (APPROVED)' : 'rechazada (REJECTED)'} exitosamente. Revisión #${result.proposal.revision} registrada.`,
      })
    } else {
      setNotification({
        type: 'err',
        message: `Error al procesar propuesta: ${result.failureReason || 'Error desconocido'}`,
      })
    }
  }

  const handleResolveConflict = (conflict: CrmConflictItem, resolution: 'local' | 'remote') => {
    setNotification(null)
    const isStale = staleSimulations[conflict.id] ?? false
    const expectedRevision = isStale ? conflict.revision - 1 : conflict.revision

    const result = resolveCrmConflict(conflict, resolution, caller, expectedRevision)

    if (result.success && result.conflict) {
      setConflicts((prev) => prev.map((c) => (c.id === conflict.id ? result.conflict! : c)))
      setNotification({
        type: 'ok',
        message: `Conflicto CRM '${conflict.fieldName}' en registro ${conflict.recordId} resuelto exitosamente (Selección: ${resolution.toUpperCase()}). Revisión #${result.conflict.revision}. Separación de dominio preservada: no se crearon ni alteraron asientos contables.`,
      })
    } else {
      setNotification({
        type: 'err',
        message: `Error al resolver conflicto CRM: ${result.failureReason || 'Error desconocido'}`,
      })
    }
  }

  const filteredProposals = proposals.filter((p) => tab === 'all' || p.domain === tab)
  const showConflicts = tab === 'all' || tab === 'crm_conflict'

  return (
    <FullPanel
      onClose={onClose}
      label="Panel de Aprobaciones y Conflictos"
      title={
        <div className="flex items-center gap-2">
          <span>Cola de Aprobaciones & Resolución de Conflictos</span>
          {totalPending > 0 && (
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
              {totalPending} Pendientes
            </span>
          )}
        </div>
      }
      bodyClassName="vp-pad flex flex-col gap-4 text-sm"
    >
      {/* ---------------------------------------------------- Role Selector */}
      <div className="p-3 rounded-lg bg-[#1a232a] border border-[#26333d] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-xs uppercase font-semibold text-[#8fa2ae]">Rol del Operador / Supervisor</span>
          <span className="text-xs text-[#8fa2ae]/80">
            Autoridad de dominio verificada: proveedores de ejecución y roles fuera del dominio son restringidos.
          </span>
        </div>
        <select
          value={caller.id}
          onChange={(e) => {
            const found = PRESET_CALLERS.find((c) => c.id === e.target.value)
            if (found) setCaller(found)
          }}
          className="bg-[#0f1418] border border-[#334654] text-white text-xs rounded-md px-3 py-1.5 focus:outline-none focus:border-amber-400"
          aria-label="Seleccionar Rol"
        >
          {PRESET_CALLERS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* ---------------------------------------------------- Notification Banner */}
      {notification && (
        <div
          role="alert"
          className={`p-3 rounded-lg border text-xs flex items-start justify-between gap-2 ${
            notification.type === 'ok'
              ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-200'
              : 'bg-rose-950/60 border-rose-500/60 text-rose-200'
          }`}
        >
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="text-xs opacity-70 hover:opacity-100 font-bold"
            aria-label="Tutup notifikasi"
          >
            ×
          </button>
        </div>
      )}

      {/* ---------------------------------------------------- Domain Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[#26333d] pb-2">
        <button
          className={`px-3 py-1 rounded text-xs font-medium transition ${
            tab === 'all' ? 'bg-[#26333d] text-white' : 'text-[#8fa2ae] hover:text-white hover:bg-[#1a232a]'
          }`}
          onClick={() => setTab('all')}
        >
          Todos ({totalPending})
        </button>
        {(['journal', 'payment', 'crm_conflict', 'campaign'] as ApprovalDomain[]).map((d) => {
          const cfg = DOMAIN_BADGES[d]
          const count =
            d === 'crm_conflict'
              ? conflicts.filter((c) => c.status === 'unresolved').length
              : proposals.filter((p) => p.domain === d && p.status === 'pending').length
          return (
            <button
              key={d}
              className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition ${
                tab === d ? 'bg-[#26333d] text-white' : 'text-[#8fa2ae] hover:text-white hover:bg-[#1a232a]'
              }`}
              onClick={() => setTab(d)}
            >
              <span>{cfg.esLabel}</span>
              {count > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-[#131b21] text-amber-300 border border-amber-500/30">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ---------------------------------------------------- Proposals List */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#8fa2ae] flex items-center justify-between">
          <span>Propuestas de Negocio Pendientes ({filteredProposals.length})</span>
          <span className="text-[11px] font-normal normal-case text-[#8fa2ae]/70">
            Revisión y autoridad de dominio protegidas
          </span>
        </h3>

        {filteredProposals.length === 0 ? (
          <div className="p-4 text-center text-xs text-[#8fa2ae] border border-dashed border-[#26333d] rounded-lg">
            No hay propuestas pendientes en esta categoría.
          </div>
        ) : (
          filteredProposals.map((p) => {
            const badge = DOMAIN_BADGES[p.domain]
            const authCheck = canUserDecideDomain(caller, p.domain)
            const isStaleSim = staleSimulations[p.id] ?? false

            return (
              <div
                key={p.id}
                className={`p-3.5 rounded-lg bg-[#141b21] border ${badge.borderClass} flex flex-col gap-2.5 transition`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-[11px] font-semibold border rounded ${badge.badgeClass}`}>
                      {badge.esLabel}
                    </span>
                    <span className="text-xs font-mono text-[#8fa2ae]">ID: {p.id}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/30">
                      Rev. #{p.revision}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                        p.status === 'approved'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                          : p.status === 'rejected'
                          ? 'bg-rose-950 text-rose-300 border border-rose-500/40'
                          : 'bg-amber-950 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-white">{p.title}</h4>
                  <p className="text-xs text-[#8fa2ae] mt-0.5">{p.description}</p>
                </div>

                {/* Payload Preview */}
                <div className="p-2.5 rounded bg-[#0b0f12] border border-[#222c35] text-xs font-mono text-[#a3b8c6] overflow-x-auto">
                  <pre className="text-[11px] whitespace-pre-wrap">
                    {JSON.stringify(p.payload, null, 2)}
                  </pre>
                </div>

                {/* Decision Info if decided */}
                {p.decision && (
                  <div className="p-2 rounded bg-[#101820] border border-cyan-800/40 text-xs text-cyan-200">
                    <div><b>Decidido por:</b> {p.decision.actorId} ({p.decision.actorRole}) · {p.decision.decision}</div>
                    {p.decision.reason && <div className="text-[11px] text-cyan-300/80 mt-0.5">Motivo: {p.decision.reason}</div>}
                  </div>
                )}

                {/* Controls Area */}
                {p.status === 'pending' && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[#222c35]">
                    {/* Stale simulation toggle */}
                    <label className="flex items-center gap-1.5 text-[11px] text-[#8fa2ae] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isStaleSim}
                        onChange={(e) =>
                          setStaleSimulations((prev) => ({ ...prev, [p.id]: e.target.checked }))
                        }
                        className="rounded border-[#334654] bg-[#0f1418] text-amber-500 focus:ring-0"
                      />
                      <span>Simular Revisión Obsoleta (Revisión #{p.revision - 1})</span>
                    </label>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      {!authCheck.allowed ? (
                        <div
                          className="text-[11px] text-rose-400 font-medium px-2 py-1 rounded bg-rose-950/40 border border-rose-800/40"
                          title={authCheck.reason}
                        >
                          ⛔ {authCheck.reason}
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => handleDecideProposal(p, 'REJECTED')}
                            className="px-3 py-1 text-xs font-medium rounded bg-rose-900/40 text-rose-200 border border-rose-700/50 hover:bg-rose-800/60 transition"
                          >
                            Rechazar
                          </button>
                          <button
                            onClick={() => handleDecideProposal(p, 'APPROVED')}
                            className="px-3 py-1 text-xs font-medium rounded bg-emerald-700 text-white hover:bg-emerald-600 transition shadow"
                          >
                            Aprobar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* ---------------------------------------------------- CRM Conflict List */}
      {showConflicts && (
        <div className="flex flex-col gap-3 mt-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#8fa2ae] flex items-center justify-between">
            <span>Resolución de Conflictos de Sincronización CRM ({conflicts.length})</span>
            <span className="text-[11px] font-normal normal-case text-amber-300">
              Decisión Humana Explícita · No Afecta Libros Contables
            </span>
          </h3>

          {conflicts.map((c) => {
            const authCheck = canUserDecideDomain(caller, 'crm_conflict')
            const isStaleSim = staleSimulations[c.id] ?? false

            return (
              <div
                key={c.id}
                className="p-3.5 rounded-lg bg-[#161c22] border border-amber-500/30 flex flex-col gap-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-[11px] font-semibold border rounded bg-amber-900/40 text-amber-300 border-amber-500/50">
                      Ingresos Contexia / Conflictos CRM
                    </span>
                    <span className="text-xs font-mono text-[#8fa2ae]">ID: {c.id}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/30">
                      Rev. #{c.revision}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                        c.status === 'resolved'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                          : 'bg-amber-950 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {c.status === 'resolved' ? 'RESUELTO' : 'PENDIENTE'}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-[#a3b8c6]">
                  Registro destino: <b className="text-white font-mono">{c.recordId}</b> · Campo:{' '}
                  <b className="text-amber-300 font-mono">{c.fieldName}</b>
                </div>

                {/* Side-by-Side Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Local Value */}
                  <div className="p-3 rounded-md bg-[#0e1419] border border-[#26333d] flex flex-col justify-between gap-2">
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-[#8fa2ae]">
                        <span className="font-semibold text-cyan-300">Valor Local (CRM Interno)</span>
                        <span>{new Date(c.localUpdatedAt).toLocaleTimeString()}</span>
                      </div>
                      <div className="mt-2 text-xs font-medium text-white p-2 rounded bg-[#131b21] border border-[#222c35]">
                        {String(c.localValue)}
                      </div>
                    </div>
                    {c.status === 'unresolved' && authCheck.allowed && (
                      <button
                        onClick={() => handleResolveConflict(c, 'local')}
                        className="w-full mt-1 py-1.5 text-xs font-semibold rounded bg-cyan-800 hover:bg-cyan-700 text-white transition"
                      >
                        Elegir Local
                      </button>
                    )}
                  </div>

                  {/* Remote Value */}
                  <div className="p-3 rounded-md bg-[#0e1419] border border-[#26333d] flex flex-col justify-between gap-2">
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-[#8fa2ae]">
                        <span className="font-semibold text-amber-400">Valor Remoto (API HubSpot)</span>
                        <span>{new Date(c.remoteUpdatedAt).toLocaleTimeString()}</span>
                      </div>
                      <div className="mt-2 text-xs font-medium text-white p-2 rounded bg-[#131b21] border border-[#222c35]">
                        {String(c.remoteValue)}
                      </div>
                    </div>
                    {c.status === 'unresolved' && authCheck.allowed && (
                      <button
                        onClick={() => handleResolveConflict(c, 'remote')}
                        className="w-full mt-1 py-1.5 text-xs font-semibold rounded bg-amber-700 hover:bg-amber-600 text-white transition"
                      >
                        Elegir HubSpot
                      </button>
                    )}
                  </div>
                </div>

                {/* Resolved Info */}
                {c.status === 'resolved' && (
                  <div className="p-2 rounded bg-[#101820] border border-emerald-800/40 text-xs text-emerald-200">
                    <b>Resuelto:</b> Seleccionada fuente <b className="uppercase">{c.resolution}</b> por{' '}
                    {c.resolvedBy}.
                  </div>
                )}

                {/* Stale simulation & permission warning for unresolved */}
                {c.status === 'unresolved' && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-[#222c35]">
                    <label className="flex items-center gap-1.5 text-[11px] text-[#8fa2ae] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isStaleSim}
                        onChange={(e) =>
                          setStaleSimulations((prev) => ({ ...prev, [c.id]: e.target.checked }))
                        }
                        className="rounded border-[#334654] bg-[#0f1418] text-amber-500 focus:ring-0"
                      />
                      <span>Simular Revisión Obsoleta (Revisión #{c.revision - 1})</span>
                    </label>

                    {!authCheck.allowed && (
                      <div className="text-[11px] text-rose-400 font-medium px-2 py-1 rounded bg-rose-950/40 border border-rose-800/40">
                        ⛔ {authCheck.reason}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </FullPanel>
  )
}
