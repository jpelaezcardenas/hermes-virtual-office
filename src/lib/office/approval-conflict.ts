/**
 * approval-conflict.ts — Domain-tagged Approval and Conflict Panel logic.
 *
 * Task 9.15 of OpenSpec bunker-virtual-office change.
 *
 * Invariants:
 * 1. Office approval actions preserve human domain authority:
 *    - Automated execution providers (manus, codex, claude_code) cannot approve business proposals.
 *    - Domain-specific authority:
 *      * journal: 'fiscal:approve' or role in ('accountant', 'admin')
 *      * payment: 'finance:approve' or role in ('treasury', 'admin')
 *      * campaign: 'marketing:approve' or role in ('marketing_lead', 'admin')
 *      * crm_conflict: 'crm:resolve_conflict' or role in ('sales_manager', 'admin')
 * 2. Revision-aware human decisions:
 *    - Stale revision rejected (expectedRevision !== currentRevision).
 * 3. Domain separation:
 *    - CRM conflict resolution never creates or mutates journal proposals or entries.
 *    - Free text is not automatically vectorized.
 */

export type ApprovalDomain = 'journal' | 'payment' | 'campaign' | 'crm_conflict'

export type ApprovalProposalStatus = 'pending' | 'approved' | 'rejected' | 'conflict_resolved'

export type ConflictStatus = 'unresolved' | 'resolved'

export interface UserContext {
  id: string
  name: string
  kind: 'human' | 'agent' | string
  role: string
  permissions?: string[]
}

export interface HumanDecision {
  decisionId: string
  actorId: string
  actorKind: 'human'
  actorRole: string
  decision: 'APPROVED' | 'REJECTED' | 'RESOLVED'
  approvedRevision: number
  selectedResolution?: Record<string, unknown> | null
  reason?: string | null
  decidedAt: string
}

export interface ApprovalProposal {
  id: string
  tenantId: string
  domain: ApprovalDomain
  title: string
  description: string
  revision: number
  contentHash: string
  payload: Record<string, unknown>
  status: ApprovalProposalStatus
  createdAt: string
  decision?: HumanDecision | null
}

export interface CrmConflictItem {
  id: string
  tenantId: string
  recordId: string
  fieldName: string
  localValue: unknown
  remoteValue: unknown
  localUpdatedAt: string
  remoteUpdatedAt: string
  revision: number
  status: ConflictStatus
  resolution?: 'local' | 'remote' | 'custom' | null
  resolvedBy?: string | null
}

export interface DecisionResult {
  success: boolean
  failureReason?: string
  proposal?: ApprovalProposal
  conflict?: CrmConflictItem
  decision?: HumanDecision
  reapprovalRequired?: boolean
}

export const BLOCKED_PROVIDERS: ReadonlySet<string> = new Set([
  'manus',
  'codex',
  'claude_code',
  'claudecode',
  'claude-code',
])

export const DOMAIN_BADGES: Record<ApprovalDomain, {
  label: string
  esLabel: string
  badgeClass: string
  borderClass: string
  textClass: string
}> = {
  journal: {
    label: 'Contabilidad',
    esLabel: 'Centinela Fiscal / Contabilidad',
    badgeClass: 'bg-purple-900/40 text-purple-300 border-purple-500/50',
    borderClass: 'border-purple-500/30',
    textClass: 'text-purple-400',
  },
  payment: {
    label: 'Pagos',
    esLabel: 'Caja Real / Pagos',
    badgeClass: 'bg-emerald-900/40 text-emerald-300 border-emerald-500/50',
    borderClass: 'border-emerald-500/30',
    textClass: 'text-emerald-400',
  },
  crm_conflict: {
    label: 'Conflictos CRM',
    esLabel: 'Ingresos Contexia / Conflictos CRM',
    badgeClass: 'bg-amber-900/40 text-amber-300 border-amber-500/50',
    borderClass: 'border-amber-500/30',
    textClass: 'text-amber-400',
  },
  campaign: {
    label: 'Campañas',
    esLabel: 'Campañas / Marketing',
    badgeClass: 'bg-blue-900/40 text-blue-300 border-blue-500/50',
    borderClass: 'border-blue-500/30',
    textClass: 'text-blue-400',
  },
}

/**
 * Checks if user has authority to decide or resolve items in a given domain.
 */
export function canUserDecideDomain(
  caller: UserContext,
  domain: ApprovalDomain,
): { allowed: boolean; reason?: string } {
  const cleanKind = (caller.kind || '').trim().toLowerCase()
  const cleanRole = (caller.role || '').trim().toLowerCase()
  const cleanId = (caller.id || '').trim().toLowerCase()

  if (cleanKind !== 'human') {
    return {
      allowed: false,
      reason: 'Penyedia otomatis (runtime/agent) tidak dapat memberikan persetujuan bisnis manusia.',
    }
  }

  if (BLOCKED_PROVIDERS.has(cleanRole) || BLOCKED_PROVIDERS.has(cleanId)) {
    return {
      allowed: false,
      reason: `Penyedia eksekusi '${caller.role || caller.id}' tidak memiliki wewenang persetujuan.`,
    }
  }

  const perms = new Set(caller.permissions || [])

  if (domain === 'journal') {
    if (perms.has('fiscal:approve') || cleanRole === 'accountant' || cleanRole === 'admin') {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'Memerlukan izin fiscal:approve atau peran Akuntan/Admin.',
    }
  }

  if (domain === 'payment') {
    if (perms.has('finance:approve') || cleanRole === 'treasury' || cleanRole === 'admin') {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'Memerlukan izin finance:approve atau peran Treasury/Admin.',
    }
  }

  if (domain === 'campaign') {
    if (perms.has('marketing:approve') || cleanRole === 'marketing_lead' || cleanRole === 'admin') {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'Memerlukan izin marketing:approve atau peran Marketing Lead/Admin.',
    }
  }

  if (domain === 'crm_conflict') {
    if (perms.has('crm:resolve_conflict') || cleanRole === 'sales_manager' || cleanRole === 'admin') {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'Memerlukan izin crm:resolve_conflict atau peran Sales Manager/Admin.',
    }
  }

  return { allowed: false, reason: 'Izin domain tidak diketahui.' }
}

/**
 * Validates debit/credit balance for journal entries.
 */
export function validateJournalBalance(payload: Record<string, unknown>): { balanced: boolean; reason?: string } {
  const debits = payload.debits !== undefined ? Number(payload.debits) : undefined
  const credits = payload.credits !== undefined ? Number(payload.credits) : undefined

  if (debits !== undefined && credits !== undefined) {
    if (isNaN(debits) || isNaN(credits) || Math.abs(debits - credits) > 0.001) {
      return {
        balanced: false,
        reason: `Entri jurnal tidak seimbang: Debet ${debits} != Kredit ${credits}`,
      }
    }
  }
  return { balanced: true }
}

/**
 * Execute human decision on an approval proposal.
 */
export function decideProposal(
  proposal: ApprovalProposal,
  decision: 'APPROVED' | 'REJECTED',
  caller: UserContext,
  expectedRevision: number,
  reason?: string,
): DecisionResult {
  const authCheck = canUserDecideDomain(caller, proposal.domain)
  if (!authCheck.allowed) {
    return {
      success: false,
      failureReason: authCheck.reason,
    }
  }

  if (proposal.status !== 'pending') {
    return {
      success: false,
      failureReason: `Proposal bukan dalam status pending (status saat ini: ${proposal.status}).`,
    }
  }

  if (proposal.revision !== expectedRevision) {
    return {
      success: false,
      failureReason: `Revisi usang: revisi yang diharapkan ${expectedRevision}, revisi proposal ${proposal.revision}.`,
    }
  }

  if (proposal.domain === 'journal') {
    const bal = validateJournalBalance(proposal.payload)
    if (!bal.balanced) {
      return {
        success: false,
        failureReason: bal.reason,
      }
    }
  }

  const decisionRecord: HumanDecision = {
    decisionId: `dec-${proposal.id}-${proposal.revision}`,
    actorId: caller.id,
    actorKind: 'human',
    actorRole: caller.role,
    decision,
    approvedRevision: proposal.revision,
    reason: reason || null,
    decidedAt: new Date().toISOString(),
  }

  const updatedProposal: ApprovalProposal = {
    ...proposal,
    status: decision === 'APPROVED' ? 'approved' : 'rejected',
    decision: decisionRecord,
  }

  return {
    success: true,
    proposal: updatedProposal,
    decision: decisionRecord,
  }
}

/**
 * Execute conflict resolution on a CRM conflict item.
 */
export function resolveCrmConflict(
  conflict: CrmConflictItem,
  resolution: 'local' | 'remote',
  caller: UserContext,
  expectedRevision: number,
): DecisionResult {
  const authCheck = canUserDecideDomain(caller, 'crm_conflict')
  if (!authCheck.allowed) {
    return {
      success: false,
      failureReason: authCheck.reason,
    }
  }

  if (conflict.status === 'resolved') {
    return {
      success: false,
      failureReason: 'Konflik sudah terselesaikan sebelumnya.',
    }
  }

  if (conflict.revision !== expectedRevision) {
    return {
      success: false,
      failureReason: `Revisi usang: revisi konflik saat ini ${conflict.revision}, diharapkan ${expectedRevision}.`,
    }
  }

  const updatedConflict: CrmConflictItem = {
    ...conflict,
    status: 'resolved',
    resolution,
    resolvedBy: caller.id,
    revision: conflict.revision + 1,
  }

  return {
    success: true,
    conflict: updatedConflict,
  }
}

/**
 * Initial sample proposals and conflicts for demonstration in OfficeApp.
 */
export const INITIAL_PROPOSALS: ApprovalProposal[] = [
  {
    id: 'prop-j-101',
    tenantId: 'tenant-contexia-main',
    domain: 'journal',
    title: 'Causación de Costos Servidor Cloud AWS',
    description: 'Asiento contable de ajuste para gastos de hosting e infraestructura del mes en curso.',
    revision: 1,
    contentHash: 'hash-j-101-aws',
    payload: {
      account: '6100-IT-INFRA',
      description: 'AWS Server Cloud Hosting Accrual',
      debits: 1850.0,
      credits: 1850.0,
      currency: 'USD',
    },
    status: 'pending',
    createdAt: '2026-11-06T08:00:00Z',
  },
  {
    id: 'prop-p-202',
    tenantId: 'tenant-contexia-main',
    domain: 'payment',
    title: 'Pago de Licencias Claude API & Anthropic',
    description: 'Aprobación de egreso operativo para cuota de tokens de modelos LLM.',
    revision: 1,
    contentHash: 'hash-p-202-anthropic',
    payload: {
      vendor: 'Anthropic PBC',
      invoiceNumber: 'INV-2026-9921',
      amount: 4500.0,
      currency: 'USD',
      method: 'Transferencia Bancaria',
    },
    status: 'pending',
    createdAt: '2026-11-06T08:30:00Z',
  },
  {
    id: 'prop-c-303',
    tenantId: 'tenant-contexia-main',
    domain: 'campaign',
    title: 'Campaña de Lanzamiento del Búnker Q4',
    description: 'Difusión de material promocional de automatización B2B vía LinkedIn y correo.',
    revision: 1,
    contentHash: 'hash-c-303-bunker-launch',
    payload: {
      channel: 'LinkedIn Ads & Email Sequence',
      budget: 2000.0,
      targetAudience: 'CTOs & Operations Leads LATAM',
    },
    status: 'pending',
    createdAt: '2026-11-06T09:15:00Z',
  },
]

export const INITIAL_CONFLICTS: CrmConflictItem[] = [
  {
    id: 'conf-crm-501',
    tenantId: 'tenant-contexia-main',
    recordId: 'lead-latam-acme-corp',
    fieldName: 'annual_revenue',
    localValue: '$250,000 (Nota de Llamada Equipo de Ventas)',
    remoteValue: '$320,000 (Sincronización HubSpot API)',
    localUpdatedAt: '2026-11-06T09:00:00Z',
    remoteUpdatedAt: '2026-11-06T09:20:00Z',
    revision: 1,
    status: 'unresolved',
  },
  {
    id: 'conf-crm-502',
    tenantId: 'tenant-contexia-main',
    recordId: 'lead-fintech-bogota',
    fieldName: 'lifecycle_stage',
    localValue: 'Lead Calificado (CRM Local)',
    remoteValue: 'Oportunidad de Ventas (HubSpot Deal Inbound)',
    localUpdatedAt: '2026-11-06T08:45:00Z',
    remoteUpdatedAt: '2026-11-06T09:10:00Z',
    revision: 1,
    status: 'unresolved',
  },
]
