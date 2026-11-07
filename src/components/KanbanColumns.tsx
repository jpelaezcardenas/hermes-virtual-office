'use client'

import { useState } from 'react'
import { useOffice } from '@/lib/store'
import type { Task } from '@/types/hermes'
import { EVIDENCE_MARK_LABEL, STALE_EVIDENCE, markClass, markOf, useEvidenceMarks } from './useEvidenceMarks'
import {
  STALE_VERIFICATION,
  VERIFICATION_MARK_LABEL,
  verificationMarkClass,
  verificationMarkOf,
  useVerificationMarks,
} from './useVerificationMarks'

/**
 * SATU-SATUNYA perender kolom kanban: view "Kanban", papan dinding 3D (KanbanModal), dan
 * panel Papan semuanya memakai ini. Dulu tiap tempat punya salinan sendiri, dan salinan
 * modal diam-diam kehilangan kolom TERHAMBAT — task yang diblokir tidak terlihat di sana.
 * Yang boleh beda antar tempat hanya bingkainya (lewat props), bukan isi kolom/kartunya.
 *
 * Task 9.18: Mempertahankan 7 kolom native Hermes lengkap:
 * 1. TODO (todo, triage, ready, scheduled)
 * 2. DIKERJAKAN (running)
 * 3. REVIEW (review)
 * 4. SELESAI (done)
 * 5. TERHAMBAT (blocked)
 * 6. ARSIP (archived)
 * 7. STATUS LAIN (status tak dikenal / unfamiliar raw state)
 */

export type KanbanColumnConfig = {
  id: string
  label: string
  statuses: string[]
  isExecutable: boolean
}

export const KANBAN_COLUMNS: KanbanColumnConfig[] = [
  { id: 'todo', label: 'POR HACER', statuses: ['todo', 'triage', 'ready', 'scheduled'], isExecutable: true },
  { id: 'running', label: 'EN CURSO', statuses: ['running'], isExecutable: false },
  { id: 'review', label: 'REVISIÓN', statuses: ['review'], isExecutable: false },
  { id: 'done', label: 'COMPLETADO', statuses: ['done'], isExecutable: false },
  { id: 'blocked', label: 'BLOQUEADO', statuses: ['blocked'], isExecutable: false },
  { id: 'archived', label: 'ARCHIVADO', statuses: ['archived'], isExecutable: false },
  { id: 'other', label: 'OTRO', statuses: [], isExecutable: false },
]

export const KNOWN = KANBAN_COLUMNS.flatMap((column) => column.statuses)

export type BlockerBadgeInfo = {
  kind: 'human' | 'dependency' | 'looping' | 'stale'
  label: string
  className: string
  offersApproval: boolean
}

/**
 * Distinguish blocker causes on TERHAMBAT cards.
 * Human blockers offer an approval action; dependency, looping, and stale blockers do not.
 */
export function getBlockerBadgeInfo(task: Task): BlockerBadgeInfo | null {
  const rawKind =
    task.blockerKind ||
    (task as any).blocker_kind ||
    (task.blockReason?.kind === 'needs_input' ? 'human' : task.blockReason?.kind)

  if (!rawKind) return null
  const k = String(rawKind).toLowerCase()

  if (k === 'human' || k === 'needs_input') {
    return {
      kind: 'human',
      label: '[Menunggu Keputusan]',
      className: 'vp-chip text-amber-300 border border-amber-500/50 bg-amber-500/10 font-semibold',
      offersApproval: true,
    }
  }
  if (k === 'dependency') {
    return {
      kind: 'dependency',
      label: '[Tergantung Tugas Lain]',
      className: 'vp-chip text-slate-300 border border-slate-500/50 bg-slate-500/10',
      offersApproval: false,
    }
  }
  if (k === 'looping') {
    return {
      kind: 'looping',
      label: '[Looping]',
      className: 'vp-chip text-red-400 border border-red-500/50 bg-red-500/10',
      offersApproval: false,
    }
  }
  if (k === 'stale') {
    return {
      kind: 'stale',
      label: '[Macet]',
      className: 'vp-chip text-orange-400 border border-orange-500/50 bg-orange-500/10',
      offersApproval: false,
    }
  }
  return null
}

export function getTaskSourceLabel(task: Task): string {
  if (task.sourceProvider) return task.sourceProvider
  if ((task as any).source_provider) return (task as any).source_provider
  if (task.origin && task.origin.kind !== 'manual') return task.origin.kind
  return 'hermes'
}

export default function KanbanColumns({
  search = false,
  freshness = false,
  closeAfterOpen,
}: {
  /** Kotak cari judul/assignee di atas kolom. */
  search?: boolean
  /** Catatan umur penanda bukti/verifikasi + "BASI". */
  freshness?: boolean
  /**
   * Dipanggil setelah `openTask`. Wadah yang menutupi panel detail (modal, panel layar
   * penuh) harus menutup diri, kalau tidak klik kartu terlihat seperti tidak terjadi apa-apa.
   */
  closeAfterOpen?: () => void
}) {
  const tasks = useOffice((s) => s.tasks)
  const openTask = useOffice((s) => s.openTask)
  const [q, setQ] = useState('')
  // Penanda dibaca dari SEMUA task, bukan hasil cari: mengetik di kotak cari tidak boleh
  // memicu batch baca bukti baru.
  // Kolom SELESAI = klaim worker; penanda bukti (ringkas) dibaca terpisah.
  const marks = useEvidenceMarks(tasks)
  // Klaim ≠ terverifikasi: penanda review independen, hanya untuk done/review.
  const vf = useVerificationMarks(tasks)

  const needle = search ? q.trim().toLowerCase() : ''
  const shown = needle
    ? tasks.filter((t) => t.title.toLowerCase().includes(needle) || (t.assignee ?? '').toLowerCase().includes(needle))
    : tasks
  const columns = KANBAN_COLUMNS.map((column) => {
    if (column.id === 'other' || column.label === 'STATUS LAIN') {
      return {
        ...column,
        items: shown.filter((task) => !KNOWN.includes(task.status)),
      }
    }
    return {
      ...column,
      items: shown.filter((task) => column.statuses.includes(task.status)),
    }
  })

  return (
    <>
      {(search || freshness) && <KanbanToolbar {...{ search, freshness, q, setQ, marks, vf }} />}
      <div className="vp-k2d-grid grid min-w-[1050px] grid-cols-7 gap-3">
        {columns.map((column) => (
          <section key={column.label} className="vp-col">
            <header className="vp-col-head">
              <span>{column.label}</span>
              <span className="vp-count">{column.items.length}</span>
            </header>
            <div className="flex flex-col gap-2">
              {column.items.map((task) => {
                const mark = markOf(marks, task)
                const vmark = verificationMarkOf(vf, task)
                const isOtherColumn = column.id === 'other' || column.label === 'STATUS LAIN'
                const isBlockedColumn = column.id === 'blocked' || column.label === 'TERHAMBAT'
                const blockerInfo = isBlockedColumn ? getBlockerBadgeInfo(task) : null
                const source = getTaskSourceLabel(task)

                return (
                  <article
                    key={task.id}
                    className="vp-card"
                    onClick={() => {
                      openTask(task.id)
                      closeAfterOpen?.()
                    }}
                  >
                    <div className="vp-card-title">{task.title}</div>
                    <div className="vp-card-meta flex flex-wrap items-center gap-1">
                      {isOtherColumn ? (
                        <>
                          <span className="vp-chip vp-chip-warn font-mono">raw: {task.status}</span>
                          <span className="vp-chip uppercase">{source}</span>
                        </>
                      ) : (
                        <span className="vp-chip">{task.assignee || '—'}</span>
                      )}

                      {!isOtherColumn && task.origin && task.origin.kind !== 'manual' && (
                        <span className={`vp-chip vp-chip-${task.origin.kind}`}>{task.origin.kind}</span>
                      )}

                      <code>{task.id}</code>

                      {blockerInfo && (
                        <span className={blockerInfo.className}>{blockerInfo.label}</span>
                      )}

                      {mark && <span className={markClass(mark)}>{EVIDENCE_MARK_LABEL[mark]}</span>}
                      {vmark && (
                        <span className={verificationMarkClass(vmark)}>{VERIFICATION_MARK_LABEL[vmark]}</span>
                      )}
                    </div>
                  </article>
                )
              })}
              {!column.items.length && <div className="vp-empty">kosong</div>}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}

function KanbanToolbar({
  search,
  freshness,
  q,
  setQ,
  marks,
  vf,
}: {
  search: boolean
  freshness: boolean
  q: string
  setQ: (q: string) => void
  marks: ReturnType<typeof useEvidenceMarks>
  vf: ReturnType<typeof useVerificationMarks>
}) {
  const marksAge = marks.readAt ? Math.round((Date.now() - marks.readAt) / 1000) : null
  const vfAge = vf.readAt ? Math.round((Date.now() - vf.readAt) / 1000) : null
  return (
    // sticky-left: di HP grid digeser ke samping, kotak cari dan catatan tetap di layar.
    <div className="vp-kanban-tools">
      {freshness && (
        <div>
          <p className="vp-sub">
            {marks.error ? (
              <span className="vp-err">gagal membaca bukti: {marks.error}</span>
            ) : marksAge == null ? (
              marks.busy ? 'membaca bukti…' : 'bukti belum dibaca'
            ) : (
              <>
                bukti ringkas (ringkasan + run, tanpa log/lampiran) · dibaca {marksAge} dtk lalu
                {marksAge > STALE_EVIDENCE && <span className="vp-warn"> · BASI</span>}
              </>
            )}
          </p>
          <p className="vp-sub">
            {vf.error ? (
              <span className="vp-err">gagal membaca verifikasi: {vf.error}</span>
            ) : vfAge == null ? (
              vf.busy ? 'membaca verifikasi…' : 'verifikasi belum dibaca'
            ) : (
              <>
                verifikasi (klaim vs review) · dibaca {vfAge} dtk lalu
                {vfAge > STALE_VERIFICATION && <span className="vp-warn"> · BASI</span>}
              </>
            )}
          </p>
        </div>
      )}
      {search && (
        <input
          className="vp-kanban-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="cari judul / assignee…"
        />
      )}
    </div>
  )
}
