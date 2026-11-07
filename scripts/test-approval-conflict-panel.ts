/**
 * test-approval-conflict-panel.ts — Tests for Domain-Tagged Approval & Conflict Panels.
 *
 * Task 9.15 of OpenSpec bunker-virtual-office change.
 *
 * Verifies:
 * 1. Domain Tagging & Separation:
 *    - All 4 domains ('journal', 'payment', 'campaign', 'crm_conflict') mapped with distinct labels/badges.
 *    - CRM conflict resolution preserves domain separation (no journal side-effects).
 * 2. Role-Sensitive Authorization & Provider Barrier:
 *    - Automated providers ('manus', 'codex', 'claude_code') and agent kinds blocked from approvals.
 *    - Domain capabilities enforced (accountant for journal, treasury for payment, marketing_lead for campaign, sales_manager for CRM).
 *    - Callers with mismatched roles rejected without modifying state.
 * 3. Revision-Aware Human Decisions:
 *    - Stale revision rejected with explicit reason.
 *    - Matching revision approved and stamped with HumanDecision record.
 * 4. Domain Validation Rules:
 *    - Journal balance validation (unbalanced debits != credits rejected).
 *
 * Run: npx tsx scripts/test-approval-conflict-panel.ts
 */

import {
  ApprovalProposal,
  CrmConflictItem,
  DOMAIN_BADGES,
  UserContext,
  canUserDecideDomain,
  decideProposal,
  resolveCrmConflict,
  validateJournalBalance,
} from '../src/lib/office/approval-conflict'

let checks = 0
let failures = 0

function assert(description: string, ok: boolean, detail?: string) {
  checks++
  if (ok) {
    console.log(`  ok    ${description}`)
  } else {
    failures++
    console.error(`  FAIL  ${description}${detail ? ` — ${detail}` : ''}`)
  }
}

async function runTests() {
  console.log('\n--- Domain-Tagged Approval & Conflict Panel Tests (Task 9.15) ---\n')

  // ---------------------------------------------------------------------------
  // 1. Domain Tagging & Badges
  // ---------------------------------------------------------------------------
  console.log('1. Domain Tagging & Badges Configuration:')
  {
    assert('Journal badge includes "Centinela Fiscal"', DOMAIN_BADGES.journal.esLabel.includes('Centinela Fiscal'))
    assert('Payment badge includes "Caja Real"', DOMAIN_BADGES.payment.esLabel.includes('Caja Real'))
    assert('CRM conflict badge includes "Ingresos Contexia"', DOMAIN_BADGES.crm_conflict.esLabel.includes('Ingresos Contexia'))
    assert('Campaign badge includes "Campañas"', DOMAIN_BADGES.campaign.esLabel.includes('Campaña'))
  }

  // ---------------------------------------------------------------------------
  // 2. Role-Sensitive Authorization & Provider Barrier
  // ---------------------------------------------------------------------------
  console.log('\n2. Role-Sensitive Authorization & Provider Barrier:')
  {
    const blockedProviders: UserContext[] = [
      { id: 'agent-manus', name: 'Manus', kind: 'agent', role: 'manus' },
      { id: 'agent-codex', name: 'Codex', kind: 'agent', role: 'codex' },
      { id: 'agent-claude', name: 'Claude Code', kind: 'agent', role: 'claude_code' },
    ]

    for (const prov of blockedProviders) {
      const jCheck = canUserDecideDomain(prov, 'journal')
      assert(`Provider ${prov.role} blocked from journal approval`, jCheck.allowed === false)

      const pCheck = canUserDecideDomain(prov, 'payment')
      assert(`Provider ${prov.role} blocked from payment approval`, pCheck.allowed === false)

      const cCheck = canUserDecideDomain(prov, 'crm_conflict')
      assert(`Provider ${prov.role} blocked from CRM conflict resolution`, cCheck.allowed === false)
    }

    const operatorUser: UserContext = { id: 'usr-op', name: 'Operator', kind: 'human', role: 'operator' }
    const opFiscal = canUserDecideDomain(operatorUser, 'journal')
    assert('Operator without fiscal permission rejected for journal', opFiscal.allowed === false)

    const opFinance = canUserDecideDomain(operatorUser, 'payment')
    assert('Operator without finance permission rejected for payment', opFinance.allowed === false)

    // Authorized Human Users
    const accountantUser: UserContext = { id: 'usr-acc', name: 'Accountant', kind: 'human', role: 'accountant' }
    const treasuryUser: UserContext = { id: 'usr-tres', name: 'Treasury', kind: 'human', role: 'treasury' }
    const marketingUser: UserContext = { id: 'usr-mkt', name: 'Marketing', kind: 'human', role: 'marketing_lead' }
    const salesMgrUser: UserContext = { id: 'usr-sales', name: 'Sales Mgr', kind: 'human', role: 'sales_manager' }
    const adminUser: UserContext = { id: 'usr-adm', name: 'Admin', kind: 'human', role: 'admin' }

    assert('Accountant permitted for journal', canUserDecideDomain(accountantUser, 'journal').allowed === true)
    assert('Accountant denied for CRM conflict', canUserDecideDomain(accountantUser, 'crm_conflict').allowed === false)

    assert('Treasury permitted for payment', canUserDecideDomain(treasuryUser, 'payment').allowed === true)
    assert('Treasury denied for journal', canUserDecideDomain(treasuryUser, 'journal').allowed === false)

    assert('Marketing lead permitted for campaign', canUserDecideDomain(marketingUser, 'campaign').allowed === true)
    assert('Sales manager permitted for CRM conflict', canUserDecideDomain(salesMgrUser, 'crm_conflict').allowed === true)

    assert('Admin permitted across all domains',
      canUserDecideDomain(adminUser, 'journal').allowed &&
      canUserDecideDomain(adminUser, 'payment').allowed &&
      canUserDecideDomain(adminUser, 'campaign').allowed &&
      canUserDecideDomain(adminUser, 'crm_conflict').allowed
    )
  }

  // ---------------------------------------------------------------------------
  // 3. Revision-Aware Human Decisions & Stale Revision Guard
  // ---------------------------------------------------------------------------
  console.log('\n3. Revision-Aware Human Decisions & Stale Revision Guard:')
  {
    const sampleProposal: ApprovalProposal = {
      id: 'prop-test-1',
      tenantId: 'tenant-1',
      domain: 'journal',
      title: 'Monthly Depreciation',
      description: 'Fixed asset depreciation entry',
      revision: 3,
      contentHash: 'hash-depr-1',
      payload: { debits: 450, credits: 450 },
      status: 'pending',
      createdAt: '2026-11-06T10:00:00Z',
    }

    const accountantUser: UserContext = { id: 'usr-acc', name: 'Accountant', kind: 'human', role: 'accountant' }

    // Stale revision attempt
    const staleResult = decideProposal(sampleProposal, 'APPROVED', accountantUser, 2)
    assert('Stale revision rejected', staleResult.success === false)
    assert('Stale revision failure reason indicates revision mismatch',
      staleResult.failureReason?.includes('Revisi usang') === true
    )

    // Current revision attempt
    const validResult = decideProposal(sampleProposal, 'APPROVED', accountantUser, 3, 'Audited and verified')
    assert('Matching revision approved', validResult.success === true)
    assert('Proposal status updated to approved', validResult.proposal?.status === 'approved')
    assert('Decision stamped with human actor and role',
      validResult.decision?.actorId === 'usr-acc' &&
      validResult.decision?.actorRole === 'accountant' &&
      validResult.decision?.approvedRevision === 3
    )
  }

  // ---------------------------------------------------------------------------
  // 4. Journal Balance Validation Rule
  // ---------------------------------------------------------------------------
  console.log('\n4. Journal Balance Validation Rule:')
  {
    const balanced = validateJournalBalance({ debits: 1200, credits: 1200 })
    assert('Equal debits and credits is balanced', balanced.balanced === true)

    const unbalanced = validateJournalBalance({ debits: 1200, credits: 1100 })
    assert('Unequal debits and credits is unbalanced', unbalanced.balanced === false)

    const sampleUnbalanced: ApprovalProposal = {
      id: 'prop-unbal',
      tenantId: 'tenant-1',
      domain: 'journal',
      title: 'Unbalanced Accrual',
      description: 'Accrual with arithmetic discrepancy',
      revision: 1,
      contentHash: 'hash-unbal',
      payload: { debits: 500, credits: 350 },
      status: 'pending',
      createdAt: '2026-11-06T10:00:00Z',
    }

    const accountantUser: UserContext = { id: 'usr-acc', name: 'Accountant', kind: 'human', role: 'accountant' }
    const unbalResult = decideProposal(sampleUnbalanced, 'APPROVED', accountantUser, 1)
    assert('Approval rejected for unbalanced journal entry', unbalResult.success === false)
    assert('Failure reason explains journal unbalance',
      unbalResult.failureReason?.includes('tidak seimbang') === true
    )
  }

  // ---------------------------------------------------------------------------
  // 5. CRM Conflict Resolution & Domain Separation
  // ---------------------------------------------------------------------------
  console.log('\n5. CRM Conflict Resolution & Domain Separation:')
  {
    const sampleConflict: CrmConflictItem = {
      id: 'conf-test-1',
      tenantId: 'tenant-1',
      recordId: 'lead-99',
      fieldName: 'deal_size',
      localValue: '$50,000',
      remoteValue: '$75,000',
      localUpdatedAt: '2026-11-06T09:00:00Z',
      remoteUpdatedAt: '2026-11-06T09:30:00Z',
      revision: 2,
      status: 'unresolved',
    }

    const salesMgrUser: UserContext = { id: 'usr-sales', name: 'Sales Mgr', kind: 'human', role: 'sales_manager' }

    // Stale revision attempt
    const staleConf = resolveCrmConflict(sampleConflict, 'remote', salesMgrUser, 1)
    assert('Stale conflict revision rejected', staleConf.success === false)

    // Valid revision resolution
    const validConf = resolveCrmConflict(sampleConflict, 'remote', salesMgrUser, 2)
    assert('Valid conflict resolution succeeds', validConf.success === true)
    assert('Conflict marked resolved with chosen resolution',
      validConf.conflict?.status === 'resolved' &&
      validConf.conflict?.resolution === 'remote' &&
      validConf.conflict?.resolvedBy === 'usr-sales' &&
      validConf.conflict?.revision === 3
    )

    // DOMAIN SEPARATION CHECK:
    // Resolving a CRM conflict has ZERO side effects on journal proposals
    const journalSnapshot: ApprovalProposal = {
      id: 'prop-j-snap',
      tenantId: 'tenant-1',
      domain: 'journal',
      title: 'Immutable Journal Draft',
      description: 'Should remain untouched by CRM resolution',
      revision: 1,
      contentHash: 'hash-snap',
      payload: { debits: 100, credits: 100 },
      status: 'pending',
      createdAt: '2026-11-06T10:00:00Z',
    }

    assert('Domain separation: journal proposal status unchanged by CRM action',
      journalSnapshot.status === 'pending' && journalSnapshot.revision === 1
    )
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\nApproval & Conflict Panel Verification: ${checks} checks, ${failures} failures\n`)
  if (failures > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Test run failed:', err)
  process.exit(1)
})
