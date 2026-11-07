'use client'

/**
 * Panel "SISTEM" — keadaan Hermes yang sebenarnya.
 *
 * Kenapa panel ini ada: kantor 3D-nya bagus, tapi BUTA. Provider bisa balas 520 beruntun,
 * agent bisa diam, dan kantornya tetap terlihat baik-baik saja. Panel ini membuat kegagalan
 * terlihat.
 *
 * Prinsip yang dipegang di sini:
 *
 *   1. SETIAP ANGKA PUNYA UMUR. Kalau data terakhir lebih tua dari ambangnya, panel bilang
 *      BASI — bukan menampilkan angka lama seolah-olah sekarang. Panel yang menampilkan
 *      keadaan lama tanpa memberi tahu adalah panel yang berbohong.
 *
 *   2. MODEL TANPA HARGA BUKAN $0. Nol palsu lebih berbahaya daripada tidak ada angka,
 *      karena operator akan mengira gratis. Jadi yang tidak diketahui ditulis "harga belum
 *      diisi", dan jumlahnya dipisahkan dari total.
 *
 *   3. YANG DILAPORKAN ADALAH SEBABNYA, BUKAN DAFTARNYA. Error dikelompokkan jadi
 *      "provider 5xx: 12x", bukan 400 baris log.
 */

import { useCallback, useEffect, useState } from 'react'
import FullPanel from './FullPanel'
import { useOffice } from '@/lib/store'

type UsageRow = {
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  apiCalls: number
  costUsd: number | null
}

type ProviderStat = {
  provider: string
  calls: number
  failures: number
  failureRate: number
  models: string[]
  confident: boolean
}

type FallbackPlan =
  | { kind: 'empty'; current: { provider: string; model: string }[] }
  | { kind: 'propose'; current: unknown[]; proposed: { provider: string; model: string }[]; why: string }
  | { kind: 'none'; current: unknown[]; why: string }

type Observability = {
  providers?: { providers: ProviderStat[]; candidates: ProviderStat[]; windowHours: number; failure?: string }
  fallback?: FallbackPlan
  status: {
    pricingModels: number
    sources: { name: string; found: boolean; ageSeconds: number | null }[]
  }
  usage: {
    readAt: string
    ageSeconds: number
    totalTokens: number
    totalInput: number
    totalOutput: number
    totalCache: number
    knownCostUsd: number
    windowDays: number
    unpricedModels: string[]
    unpricedTokens: number
    rows: UsageRow[]
    recentSessions: { id: string; model: string; inputTokens: number; outputTokens: number; costUsd: number | null }[]
  }
  errors: {
    ageSeconds: number
    total: number
    buckets: { kind: string; count: number; sample: string }[]
    recent: string[]
  }
}

type Approvals = {
  policy: { mode: string | null; timeoutSec: number | null; denyCount: number; ageSeconds: number; failure?: string }
  patterns: {
    count: number
    windowDays: number
    proposals: { pattern: string; kind: string; count: number }[]
    ageSeconds: number
    failure?: string
  }
  pending: { id: string; title: string; reason: { kind: string; reason: string } }[]
  blockedAgents: string[]
  notRead?: number
}

/** Ambang "basi". Bukan angka ajaib: 10 menit untuk log, 1 jam untuk basis data pemakaian. */
const STALE_LOG = 600
const STALE_DB = 3600
/** 5 menit untuk persetujuan — sama dengan APPROVAL_STALE_SEC di lib/hermes/approvals.ts. */
const STALE_APPROVAL = 300

const nfmt = (n: number) => n.toLocaleString('id-ID')
const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`
const tok = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} M` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} jt` : nfmt(n))

function age(sec: number | null): string {
  if (sec == null || sec < 0) return '—'
  if (sec < 60) return `${sec} dtk`
  if (sec < 3600) return `${Math.floor(sec / 60)} mnt`
  if (sec < 86400) return `${Math.floor(sec / 3600)} jam`
  return `${Math.floor(sec / 86400)} hari`
}

export default function SystemPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<Observability | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [days, setDays] = useState(30)
  const [notice, setNotice] = useState<string | null>(null)
  const [appr, setAppr] = useState<Approvals | null>(null)
  const [apprErr, setApprErr] = useState<string | null>(null)
  /**
   * "Butuh restart gateway?" — SATU sumber kebenaran: dibaca dari
   * /api/hermes/agents (pembanding mtime config vs start gateway yang SAMA
   * dipakai doctor). Panel ini TIDAK menghitung ulang. null = tak pasti.
   */
  const [needsGatewayRestart, setNeedsGatewayRestart] = useState<boolean | null>(null)
  const work = useOffice((st) => st.work)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/hermes/observability?days=${days}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message || 'gagal membaca keadaan sistem')
      setData(json)
      setErr(null)
    } catch (e) {
      // Gagal membaca BUKAN alasan menampilkan angka lama. Panelnya harus bilang dia tidak tahu.
      setErr((e as Error).message)
      setData(null)
    } finally {
      setBusy(false)
    }
  }, [days])

  // Dipisah dari `load`: pembacaan pola (`approvals suggest`) bisa makan 25 detik, dan itu tidak
  // boleh menahan angka biaya dan error yang sudah siap.
  const loadApprovals = useCallback(async () => {
    try {
      const res = await fetch('/api/hermes/approvals', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message || 'gagal membaca persetujuan')
      setAppr(json)
      setApprErr(null)
    } catch (e) {
      // Sama dengan `load`: gagal = bilang tidak tahu, bukan menampilkan daftar tunggu lama.
      setApprErr((e as Error).message)
      setAppr(null)
    }
  }, [])

  /**
   * Keadaan restart: ikut poll yang sama, tapi dari SATU sumber kebenaran
   * (/api/hermes/agents). Gagal dibaca = null (tak pasti), bukan hijau.
   */
  const loadRestart = useCallback(async () => {
    try {
      const res = await fetch('/api/hermes/agents', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message || 'gagal membaca keadaan restart')
      setNeedsGatewayRestart(json?.needsGatewayRestart ?? null)
    } catch {
      setNeedsGatewayRestart(null)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    load()
    loadApprovals()
    loadRestart()
    const t = setInterval(() => {
      load()
      loadApprovals()
      loadRestart()
    }, 30_000)
    return () => clearInterval(t)
  }, [open, load, loadApprovals, loadRestart])

  if (!open) return null

  const u = data?.usage
  const e = data?.errors
  const s = data?.status
  const logStale = !!e && e.ageSeconds > STALE_LOG
  const dbStale = !!u && u.ageSeconds > STALE_DB
  const top = (u?.rows || []).filter((r) => (r.costUsd ?? 0) > 0.005).slice(0, 8)

  return (
    <FullPanel
      variant="slate"
      onClose={onClose}
      label="Sistema"
      title="Sistema"
      actions={
        <>
          <select
            value={days}
            onChange={(ev) => setDays(Number(ev.target.value))}
            className="rounded border border-slate-600 bg-slate-800 px-2 py-1"
          >
            <option value={1}>1 día</option>
            <option value={7}>7 días</option>
            <option value={30}>30 días</option>
            <option value={365}>todos</option>
          </select>
          <button
            onClick={() => {
              load()
              loadApprovals()
              loadRestart()
            }}
            disabled={busy} className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800">
            {busy ? '...' : 'Actualizar'}
          </button>
        </>
      }
    >

      {err && (
        <div className="mb-4 rounded border border-red-800 bg-red-950/50 p-3 text-sm">
          <b>No se puede leer el estado del sistema.</b>
          <div className="mt-1 text-red-300">{err}</div>
        </div>
      )}

      {notice && <div className="mb-4 rounded border border-slate-600 bg-slate-800/60 p-2 text-xs">{notice}</div>}

      {/* ---------- gateway ---------- */}
      <section className="mb-5">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Gateway</h3>
        <div className="space-y-1 rounded border border-slate-700 bg-slate-800/50 p-2 text-xs">
          <div>
            reinicio del gateway:{' '}
            {needsGatewayRestart === true ? (
              <span className="text-amber-300">requerido — configuración más reciente que el inicio (agentes guardados pendientes de activar)</span>
            ) : needsGatewayRestart === false ? (
              <span className="text-emerald-300">al día — agentes activos</span>
            ) : (
              <span className="text-slate-500">desconocido — inicio del gateway no registrado</span>
            )}
          </div>
        </div>
      </section>

      {/* ---------- kerja di kantor ---------- */}
      <section className="mb-5">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Actividad en oficina</h3>
        <div className="space-y-1 rounded border border-slate-700 bg-slate-800/50 p-2 text-xs">
          <div>
            chat activo:{' '}
            {work.chatLive.length ? <span className="font-mono">{work.chatLive.join(', ')}</span> : <span className="text-slate-500">ninguno</span>}
          </div>
          <div>
            {work.cron ? (
              <>
                cron <span className="font-mono">{work.cron.name}</span> ejecutado hace {age(work.cron.agoSec)}
              </>
            ) : (
              <span className="text-slate-500">sin tareas cron en los últimos 2 minutos</span>
            )}
          </div>
        </div>
      </section>

      {/* ---------- persetujuan ---------- */}
      <section className="mb-5">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Aprobaciones
          {appr && (
            <span className={`ml-2 ${appr.pending.length > 0 ? 'text-red-400' : 'text-slate-500'}`}>
              · {appr.pending.length} pendientes
            </span>
          )}
        </h3>
        {apprErr ? (
          <div className="rounded border border-red-800 bg-red-950/50 p-2 text-xs">
            <b>No se puede leer el estado de aprobaciones.</b>
            <div className="mt-1 text-red-300">{apprErr}</div>
          </div>
        ) : !appr ? (
          <div className="rounded border border-slate-700 bg-slate-800/50 p-2 text-xs text-slate-400">cargando…</div>
        ) : (
          <div className="space-y-2 text-xs">
            <div className="rounded border border-slate-700 bg-slate-800/50 p-2">
              {appr.policy.failure ? (
                <span className="text-red-300">Política no legible: {appr.policy.failure}</span>
              ) : (
                <>
                  política <span className="font-mono">{appr.policy.mode}</span>
                  <span className="text-slate-400">
                    {' '}
                    · tiempo espera {appr.policy.timeoutSec ?? '—'} s · {appr.policy.denyCount} reglas de denegación
                  </span>
                </>
              )}
            </div>

            {appr.pending.length === 0 ? (
              <div className="rounded border border-slate-700 bg-slate-800/50 p-2 text-slate-400">
                No hay decisiones pendientes.
              </div>
            ) : (
              <div className="space-y-1">
                {appr.pending.map((w) => (
                  <div key={w.id} className="rounded border border-red-800 bg-red-950/40 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-red-300">{w.title}</span>
                      <span className="font-mono text-[11px] text-slate-400">{w.id}</span>
                    </div>
                    <div className="mt-1 text-red-200/80">{w.reason.reason}</div>
                  </div>
                ))}
                {appr.blockedAgents.length > 0 && (
                  <div className="text-[11px] text-red-400/80">
                    agentes detenidos: {appr.blockedAgents.join(' · ')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {!data && !err && <div className="py-8 text-center text-sm text-slate-400">cargando…</div>}

      {data && (
        <div className="space-y-5">
          {/* ---------- sumber & umur ---------- */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Fuentes de datos</h3>
            <div className="grid grid-cols-3 gap-2 text-xs max-[720px]:grid-cols-2">
              {(s?.sources || []).map((src) => (
                <div key={src.name} className="rounded border border-slate-700 bg-slate-800/50 p-2">
                  <div className="flex items-center gap-1">
                    <span className={src.found ? 'text-green-400' : 'text-red-400'}>{src.found ? '●' : '○'}</span>
                    <span className="truncate font-mono">{src.name}</span>
                  </div>
                  <div className="mt-1 text-slate-400">antigüedad {age(src.ageSeconds)}</div>
                </div>
              ))}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {s?.pricingModels ?? 0} tarifas disponibles en caché
            </div>
          </section>

          {/* ---------- biaya ---------- */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Uso y costos{' '}
              <span className="text-slate-500">
                ({u!.windowDays >= 365 ? 'histórico completo' : `últimos ${u!.windowDays} días`})
              </span>
            </h3>
            <div className="grid grid-cols-4 gap-2 text-xs max-[720px]:grid-cols-2">
              <div className="rounded border border-slate-700 bg-slate-800/50 p-2">
                <div className="text-slate-400">costo calculado</div>
                <div className="text-lg font-semibold text-emerald-400">{usd(u!.knownCostUsd)}</div>
              </div>
              <div className="rounded border border-slate-700 bg-slate-800/50 p-2">
                <div className="text-slate-400">tokens entrada</div>
                <div className="text-lg font-semibold">{tok(u!.totalInput)}</div>
              </div>
              <div className="rounded border border-slate-700 bg-slate-800/50 p-2">
                <div className="text-slate-400">tokens salida</div>
                <div className="text-lg font-semibold">{tok(u!.totalOutput)}</div>
              </div>
              <div className="rounded border border-slate-700 bg-slate-800/50 p-2">
                <div className="text-slate-400">lecturas caché</div>
                <div className="text-lg font-semibold">{tok(u!.totalCache)}</div>
              </div>
            </div>

            {u!.unpricedModels.length > 0 && (
              <div className="mt-2 rounded border border-amber-800 bg-amber-950/40 p-2 text-xs">
                <b className="text-amber-300">{u!.unpricedModels.length} modelos sin precio registrado</b>
                <span className="text-amber-200/80">
                  {' '}
                  — {tok(u!.unpricedTokens)} tokens no computados en la tarifa.
                </span>
                <div className="mt-1 font-mono text-[11px] text-amber-300/70">{u!.unpricedModels.join(' · ')}</div>
              </div>
            )}

            {top.length > 0 && (
              <table className="mt-2 w-full text-xs">
                <thead className="text-slate-400">
                  <tr>
                    <th className="text-left font-normal">modelo</th>
                    <th className="text-right font-normal">entrada</th>
                    <th className="text-right font-normal">salida</th>
                    <th className="text-right font-normal">llamadas</th>
                    <th className="text-right font-normal">costo</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((r) => (
                    <tr key={`${r.model}|${r.provider}`} className="border-t border-slate-800">
                      <td className="py-1 pr-2 font-mono text-[11px]">{r.model}</td>
                      <td className="py-1 text-right text-slate-400">{tok(r.inputTokens)}</td>
                      <td className="py-1 text-right text-slate-400">{tok(r.outputTokens)}</td>
                      <td className="py-1 text-right text-slate-400">{nfmt(r.apiCalls)}</td>
                      <td className="py-1 text-right font-semibold text-emerald-400">
                        {r.costUsd == null ? <span className="text-amber-500">sin tarifa</span> : usd(r.costUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* ---------- provider ---------- */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Proveedores {data.providers?.windowHours ? `(${data.providers.windowHours} h)` : ''}
            </h3>
            {!data.providers || data.providers.providers.length === 0 ? (
              <div className="rounded border border-slate-700 bg-slate-800/50 p-2 text-xs text-slate-400">
                {data.providers?.failure
                  ? `No se pudieron leer las estadísticas del proveedor: ${data.providers.failure}`
                  : 'Sin llamadas a API registradas en esta ventana.'}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-slate-400">
                  <tr>
                    <th className="text-left font-normal">proveedor</th>
                    <th className="text-right font-normal">llamadas</th>
                    <th className="text-right font-normal">fallos</th>
                    <th className="text-right font-normal">tasa</th>
                  </tr>
                </thead>
                <tbody>
                  {data.providers.providers.map((p) => (
                    <tr key={p.provider} className="border-t border-slate-800">
                      <td className="py-1 pr-2">
                        <span className={p.failures > 0 ? 'text-red-300' : 'text-emerald-300'}>{p.provider}</span>
                        {!p.confident && (
                          <span className="ml-2 text-[10px] text-slate-500">
                            muestra pequeña
                          </span>
                        )}
                      </td>
                      <td className="py-1 text-right text-slate-400">{nfmt(p.calls)}</td>
                      <td className={`py-1 text-right ${p.failures > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                        {nfmt(p.failures)}
                      </td>
                      <td className="py-1 text-right font-mono">
                        {p.failures === 0 ? '—' : `${(p.failureRate * 100).toFixed(0)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* ---------- error ---------- */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Errores en las últimas 24 horas
            </h3>
            {e!.total === 0 ? (
              <div className="rounded border border-slate-700 bg-slate-800/50 p-3 text-xs text-slate-400">
                No hay errores registrados en las últimas 24 horas.
              </div>
            ) : (
              <>
                <div className="mb-2 text-xs text-slate-400">{nfmt(e!.total)} líneas con error</div>
                <div className="space-y-1">
                  {e!.buckets.map((b) => {
                    const critical = /5xx|rate|ditolak|context/.test(b.kind)
                    return (
                      <div
                        key={b.kind}
                        className={`rounded border p-2 text-xs ${
                          critical ? 'border-red-800 bg-red-950/40' : 'border-slate-700 bg-slate-800/50'
                        }`}
                        title={b.sample}
                      >
                        <div className="flex items-center justify-between">
                          <span className={critical ? 'font-semibold text-red-300' : ''}>{b.kind}</span>
                          <span className="font-mono">{nfmt(b.count)}×</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </FullPanel>
  )
}
