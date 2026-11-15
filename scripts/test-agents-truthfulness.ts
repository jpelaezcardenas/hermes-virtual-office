/**
 * Test Agents Route Truthfulness & Read Auth — Fase 1.1b
 *
 * Verifies:
 * 1. Anonymous GET /api/hermes/agents fails closed (401) when auth is enabled.
 * 2. Authenticated GET /api/hermes/agents in live mode never fabricates synthetic agents on error (503, unavailable: true, available: []).
 * 3. Demo mode returns explicit demo: true, mode: 'demo'.
 *
 * Run: npx tsx scripts/test-agents-truthfulness.ts
 */

import { NextRequest } from 'next/server'
import { GET } from '../src/app/api/hermes/agents/route'
import { signStudioSession } from '../src/lib/local-guard'

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

async function run() {
  console.log('\n--- Agents Route Truthfulness & Read Auth Tests (Fase 1.1b) ---\n')

  const origMode = process.env.OFFICE_MODE
  const origReadAuth = process.env.OFFICE_REQUIRE_READ_AUTH
  const origSecret = process.env.STUDIO_SESSION_SECRET
  const origHermesHome = process.env.HERMES_HOME

  process.env.STUDIO_SESSION_SECRET = 'test-agents-truthfulness-secret-32b'
  process.env.OFFICE_REQUIRE_READ_AUTH = 'true'
  delete process.env.OFFICE_MODE

  try {
    // 1. Anonymous request rejected (401)
    {
      const req = new NextRequest('http://localhost:3001/api/hermes/agents', {
        method: 'GET',
        headers: { host: 'localhost:3001' },
      })
      const res = await GET(req)
      assert('anonymous GET /api/hermes/agents returns 401', res.status === 401, `got ${res.status}`)
    }

    // 2. Authenticated live request when Hermes is missing/unreachable -> 503, no fake 11 agents
    {
      process.env.HERMES_HOME = 'C:\\nonexistent-hermes-home-99999'
      const token = signStudioSession({
        sub: 'op-1',
        tenantId: 'tenant-1',
        role: 'operator',
        studioId: 'contexia-hermes-studio',
      })
      const req = new NextRequest('http://localhost:3001/api/hermes/agents', {
        method: 'GET',
        headers: {
          host: 'localhost:3001',
          cookie: `office_session=${token}`,
        },
      })
      const res = await GET(req)
      const body = (await res.json()) as Record<string, unknown>
      assert('live failure returns 503 (or real empty)', res.status === 503 || (Array.isArray(body.available) && body.available.length === 0), `status=${res.status}, available=${JSON.stringify(body.available)}`)
      assert('live failure never returns synthetic 11 agents', Array.isArray(body.available) && body.available.length === 0, `len=${Array.isArray(body.available) ? body.available.length : 'non-array'}`)
      assert('live response includes observedAt and mode=live', typeof body.observedAt === 'string' && body.mode === 'live')
    }

    // 3. Demo mode returns explicit demo: true, mode: 'demo'
    {
      process.env.OFFICE_MODE = 'demo'
      const req = new NextRequest('http://localhost:3001/api/hermes/agents', {
        method: 'GET',
        headers: { host: 'localhost:3001' },
      })
      const res = await GET(req)
      const body = (await res.json()) as Record<string, unknown>
      assert('demo mode returns 200 with demo=true', res.status === 200 && body.demo === true && body.mode === 'demo')
    }
  } finally {
    process.env.OFFICE_MODE = origMode
    process.env.OFFICE_REQUIRE_READ_AUTH = origReadAuth
    process.env.STUDIO_SESSION_SECRET = origSecret
    process.env.HERMES_HOME = origHermesHome
  }

  console.log(`\nResults: ${checks - failures}/${checks} checks passed.`)
  if (failures > 0) process.exit(1)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
