/**
 * Test Demo Mode Boundary — Task 9.1
 *
 * Verifies:
 * 1. Demo entry command sets mode to 'demo'.
 * 2. In demo mode: production credentials cannot be read (all secret keys stripped/blanked).
 * 3. In demo mode: claiming live work, promoting tasks, unblocking, executing actions are strictly rejected.
 * 4. Connection loss in live mode reports disconnected/stale and NEVER falls back to demo data.
 * 5. Persistent DEMO indicator is visible in demo mode and absent in live mode.
 * 6. package.json contains the isolated demo command and test script.
 *
 * Run: npx tsx scripts/test-demo-mode-boundary.ts
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  OfficeMode,
  getOfficeMode,
  isDemoMode,
  sanitizeCredentialsForMode,
  checkActionAllowedInMode,
  handleConnectionLoss,
} from '../src/lib/office/mode'
import { checkAction, checkAgentAction } from '../src/lib/hermes/control'

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

console.log('\n--- Virtual Office Demo Boundary & Isolation Tests (Task 9.1) ---\n')

// 1. Mode detection
{
  const origEnv = process.env.OFFICE_MODE
  const origNextEnv = process.env.NEXT_PUBLIC_OFFICE_MODE
  try {
    delete process.env.OFFICE_MODE
    delete process.env.NEXT_PUBLIC_OFFICE_MODE
    assert('default mode is live', getOfficeMode() === 'live' && isDemoMode() === false)

    process.env.OFFICE_MODE = 'demo'
    assert('OFFICE_MODE=demo sets mode to demo', getOfficeMode() === 'demo' && isDemoMode() === true)

    delete process.env.OFFICE_MODE
    process.env.NEXT_PUBLIC_OFFICE_MODE = 'demo'
    assert('NEXT_PUBLIC_OFFICE_MODE=demo sets mode to demo', getOfficeMode() === 'demo' && isDemoMode() === true)
  } finally {
    process.env.OFFICE_MODE = origEnv
    process.env.NEXT_PUBLIC_OFFICE_MODE = origNextEnv
  }
}

// 2. Production credential sanitization in demo mode
{
  const testCreds = {
    AI_API_KEY: 'sk-proj-super-secret-key-12345',
    HERMES_BIN: '/usr/local/bin/hermes',
    anthropic_api_key: 'sk-ant-secret-key-67890',
    bridge_token: 'bearer-jwt-token-val',
    db_password: 'super-secure-pass',
    client_secret: 'oauth-client-secret-xyz',
    safe_host: 'https://office.example.com',
    max_concurrency: 4,
  }

  const sanitized = sanitizeCredentialsForMode(testCreds, 'demo')
  assert('demo mode blanks AI_API_KEY', sanitized.AI_API_KEY === '')
  assert('demo mode blanks HERMES_BIN', sanitized.HERMES_BIN === '')
  assert('demo mode blanks anthropic_api_key', sanitized.anthropic_api_key === '')
  assert('demo mode blanks bridge_token', sanitized.bridge_token === '')
  assert('demo mode blanks db_password', sanitized.db_password === '')
  assert('demo mode blanks client_secret', sanitized.client_secret === '')
  assert('demo mode preserves non-secret host', sanitized.safe_host === 'https://office.example.com')
  assert('demo mode preserves non-secret numbers', sanitized.max_concurrency === 4)

  const livePreserved = sanitizeCredentialsForMode(testCreds, 'live')
  assert('live mode preserves all production secrets', livePreserved.AI_API_KEY === testCreds.AI_API_KEY)
}

// 3. Action and live work rejection in demo mode
{
  const actionsToCheck = ['claim', 'dispatch', 'unblock', 'promote', 'release', 'pauseAll', 'resumeAll', 'steer', 'advance', 'spawn', 'kill', 'create', 'setModel']
  for (const action of actionsToCheck) {
    const check = checkActionAllowedInMode(action, 'demo')
    assert(`demo mode rejects action "${action}"`, check.allowed === false && check.reason === 'demo_mode_cannot_claim_live_work')
  }

  const liveCheck = checkActionAllowedInMode('promote', 'live')
  assert('live mode allows standard action checks', liveCheck.allowed === true)
}

// 4. Hermes control integration with demo boundary
{
  const origNextEnv = process.env.NEXT_PUBLIC_OFFICE_MODE
  try {
    process.env.NEXT_PUBLIC_OFFICE_MODE = 'demo'

    // Operator action in demo mode
    const opVerdict = checkAction({ action: 'unblock', taskId: 't_12345678', reason: 'Test reason' })
    assert('checkAction rejects in demo mode', opVerdict.allowed === false && (opVerdict as any).why === 'demo_mode_cannot_claim_live_work')

    // Agent action in demo mode
    const agentVerdict = checkAgentAction({
      agent: 'centinela',
      role: 'orchestrator',
      action: 'advance',
      taskId: 't_12345678',
      reason: 'Advance task',
    })
    assert('checkAgentAction rejects in demo mode', agentVerdict.allowed === false && (agentVerdict as any).why === 'demo_mode_cannot_claim_live_work')
  } finally {
    process.env.NEXT_PUBLIC_OFFICE_MODE = origNextEnv
  }
}

// 5. Connection loss transitions (NEVER falls back to demo data in live mode)
{
  const liveLoss = handleConnectionLoss('live', 'connected')
  assert('live mode connection loss sets status to disconnected or stale', liveLoss.status === 'disconnected' || liveLoss.status === 'stale')
  assert('live mode connection loss NEVER falls back to demo fixtures', liveLoss.fallbackToDemo === false && liveLoss.activeFixtureAgents === false)

  const demoLoss = handleConnectionLoss('demo', 'connected')
  assert('demo mode retains demo fixtures', demoLoss.status === 'demo' && demoLoss.fallbackToDemo === true && demoLoss.activeFixtureAgents === true)
}

// 6. UI DEMO indicator and package.json commands
{
  const pkgPath = join(__dirname, '..', 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  assert('package.json has "demo" script', typeof pkg.scripts.demo === 'string' && pkg.scripts.demo.includes('NEXT_PUBLIC_OFFICE_MODE=demo'))
  assert('package.json has "test:demo" script', pkg.scripts['test:demo'] === 'tsx scripts/test-demo-mode-boundary.ts')

  const officeAppPath = join(__dirname, '..', 'src', 'components', 'OfficeApp.tsx')
  const officeAppSrc = readFileSync(officeAppPath, 'utf-8')
  assert('OfficeApp imports isDemoMode', /import\s+.*isDemoMode.*from\s+['"]@\/lib\/office\/mode['"]/.test(officeAppSrc))
  assert('OfficeApp contains data-testid="office-demo-badge"', officeAppSrc.includes('data-testid="office-demo-badge"'))
}

console.log(`\n${checks - failures}/${checks} checks passed\n`)
if (failures) {
  console.error(`${failures} FAILED\n`)
  process.exit(1)
} else {
  console.log('All demo boundary checks passed successfully!\n')
}
