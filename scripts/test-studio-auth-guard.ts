/**
 * Test Studio Auth Guard — Fase 1.1a (TDD)
 *
 * Verifies:
 * 1. Forged office_session cookies or x-office-session headers are rejected (401).
 * 2. Client-asserted x-office-role cannot escalate above verified session role.
 * 3. Valid HMAC-signed session tokens work for matching/lower roles and reject expired/revoked tokens.
 * 4. assertStudioReadRequest protects read/stream routes fail-closed when auth is enabled.
 * 5. STUDIO_ACCESS_TOKEN grants machine-to-machine admin access.
 *
 * Run: npx tsx scripts/test-studio-auth-guard.ts
 */

import { NextRequest } from 'next/server'
import {
  assertLocalWriteRequest,
  assertStudioReadRequest,
  signStudioSession,
  verifyStudioSession,
  revokeStudioSession,
  type StudioSessionPayload,
} from '../src/lib/local-guard'
import { POST as evidencePost } from '../src/app/api/hermes/tasks/evidence/route'
import { POST as verificationPost } from '../src/app/api/hermes/tasks/verification/route'
import { GET as cronGet } from '../src/app/api/hermes/cron/route'
import { GET as toolsetsGet } from '../src/app/api/hermes/toolsets/route'

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
  console.log('\n--- Studio Auth Guard & Signed Session Tests (Fase 1.1a) ---\n')

  const origToken = process.env.STUDIO_ACCESS_TOKEN
  const origWriteAuth = process.env.OFFICE_REQUIRE_WRITE_AUTH
  const origReadAuth = process.env.OFFICE_REQUIRE_READ_AUTH
  const origSecret = process.env.STUDIO_SESSION_SECRET

  process.env.STUDIO_ACCESS_TOKEN = 'test-studio-token-123'
  process.env.OFFICE_REQUIRE_WRITE_AUTH = 'true'
  process.env.OFFICE_REQUIRE_READ_AUTH = 'true'
  process.env.STUDIO_SESSION_SECRET = 'test-hmac-secret-key-at-least-32-bytes'

  try {
    // 1. Reject forged cookie + client-asserted admin role
    {
      const req = new Request('http://localhost:3001/api/hermes/control', {
        method: 'POST',
        headers: {
          host: 'localhost:3001',
          origin: 'http://localhost:3001',
          cookie: 'office_session=forged-nonempty-cookie',
          'x-office-role': 'admin',
        },
      })
      const res = assertLocalWriteRequest(req, 'admin')
      assert('rejects forged office_session cookie with 401', res !== null && res.status === 401, `got ${res?.status}`)
    }

    // 2. Reject forged x-office-session header
    {
      const req = new Request('http://localhost:3001/api/hermes/control', {
        method: 'POST',
        headers: {
          host: 'localhost:3001',
          origin: 'http://localhost:3001',
          'x-office-session': 'invented-session-header',
          'x-office-role': 'admin',
        },
      })
      const res = assertLocalWriteRequest(req, 'admin')
      assert('rejects forged x-office-session header with 401', res !== null && res.status === 401, `got ${res?.status}`)
    }

    // 3. Valid signed viewer session cannot escalate via x-office-role: admin
    const viewerToken = signStudioSession({
      sub: 'user-viewer-1',
      tenantId: 'tenant-1',
      role: 'viewer',
      studioId: 'contexia-hermes-studio',
      ttlSeconds: 300,
    })
    {
      const req = new Request('http://localhost:3001/api/hermes/control', {
        method: 'POST',
        headers: {
          host: 'localhost:3001',
          origin: 'http://localhost:3001',
          cookie: `office_session=${viewerToken}`,
          'x-office-role': 'admin',
        },
      })
      const res = assertLocalWriteRequest(req, 'admin')
      assert('blocks viewer from escalating to admin via x-office-role (403)', res !== null && res.status === 403, `got ${res?.status}`)
    }

    // 4. Valid signed admin session succeeds without x-office-role header
    const adminPayload: StudioSessionPayload = {
      sub: 'user-admin-1',
      tenantId: 'tenant-1',
      role: 'admin',
      studioId: 'contexia-hermes-studio',
      exp: Math.floor(Date.now() / 1000) + 300,
      jti: 'jti-admin-test-1',
    }
    const adminToken = signStudioSession(adminPayload)
    {
      const req = new Request('http://localhost:3001/api/hermes/control', {
        method: 'POST',
        headers: {
          host: 'localhost:3001',
          origin: 'http://localhost:3001',
          cookie: `office_session=${adminToken}`,
        },
      })
      const res = assertLocalWriteRequest(req, 'admin')
      assert('allows valid signed admin session without x-office-role', res === null, `got ${res?.status}`)
    }

    // 5. Expired session is rejected
    const expiredToken = signStudioSession({
      sub: 'user-expired',
      tenantId: 'tenant-1',
      role: 'admin',
      studioId: 'contexia-hermes-studio',
      exp: Math.floor(Date.now() / 1000) - 60,
      jti: 'jti-expired-1',
    })
    {
      const verified = verifyStudioSession(expiredToken)
      assert('verifyStudioSession rejects expired token', verified === null)
      const req = new Request('http://localhost:3001/api/hermes/control', {
        method: 'POST',
        headers: {
          host: 'localhost:3001',
          origin: 'http://localhost:3001',
          'x-office-session': expiredToken,
        },
      })
      const res = assertLocalWriteRequest(req, 'operator')
      assert('rejects expired session on write with 401', res !== null && res.status === 401, `got ${res?.status}`)
    }

    // 6. Revoked session is rejected
    {
      revokeStudioSession('jti-admin-test-1')
      const req = new Request('http://localhost:3001/api/hermes/control', {
        method: 'POST',
        headers: {
          host: 'localhost:3001',
          origin: 'http://localhost:3001',
          cookie: `office_session=${adminToken}`,
        },
      })
      const res = assertLocalWriteRequest(req, 'admin')
      assert('rejects revoked session with 401', res !== null && res.status === 401, `got ${res?.status}`)
    }

    // 7. Read guard fails closed when unauthenticated, succeeds with valid session
    {
      const anonReq = new Request('http://localhost:3001/api/hermes/agents', {
        method: 'GET',
        headers: { host: 'localhost:3001' },
      })
      const anonRes = assertStudioReadRequest(anonReq)
      assert('assertStudioReadRequest rejects anonymous read with 401', anonRes !== null && anonRes.status === 401, `got ${anonRes?.status}`)

      const authReq = new Request('http://localhost:3001/api/hermes/agents', {
        method: 'GET',
        headers: {
          host: 'localhost:3001',
          cookie: `office_session=${viewerToken}`,
        },
      })
      const authRes = assertStudioReadRequest(authReq)
      assert('assertStudioReadRequest allows valid signed viewer session', authRes === null, `got ${authRes?.status}`)
    }

    // 8. STUDIO_ACCESS_TOKEN grants machine-to-machine admin access
    {
      const m2mReq = new Request('http://localhost:3001/api/hermes/control', {
        method: 'POST',
        headers: {
          host: 'localhost:3001',
          origin: 'http://localhost:3001',
          'x-studio-access-token': 'test-studio-token-123',
        },
      })
      const res = assertLocalWriteRequest(m2mReq, 'admin')
      assert('allows STUDIO_ACCESS_TOKEN for admin write', res === null, `got ${res?.status}`)
    }

    // 9. Production mode fails closed on read even without env auth flags
    {
      const origNodeEnv = process.env.NODE_ENV
      delete process.env.STUDIO_ACCESS_TOKEN
      delete process.env.OFFICE_REQUIRE_READ_AUTH
      delete process.env.OFFICE_REQUIRE_WRITE_AUTH
      ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
      try {
        const anonReq = new Request('http://localhost:3001/api/hermes/agents', {
          method: 'GET',
          headers: { host: 'localhost:3001' },
        })
        const res = assertStudioReadRequest(anonReq)
        assert('NODE_ENV=production fails closed on anonymous read without env flags (401)', res !== null && res.status === 401, `got ${res?.status}`)
      } finally {
        ;(process.env as Record<string, string | undefined>).NODE_ENV = origNodeEnv
        process.env.STUDIO_ACCESS_TOKEN = 'test-studio-token-123'
        process.env.OFFICE_REQUIRE_WRITE_AUTH = 'true'
        process.env.OFFICE_REQUIRE_READ_AUTH = 'true'
      }
    }

    // 10. Evidence & verification batch POST routes enforce assertStudioReadRequest
    {
      const evReq = new NextRequest('http://localhost:3001/api/hermes/tasks/evidence', {
        method: 'POST',
        headers: { host: 'localhost:3001', 'content-type': 'application/json' },
        body: JSON.stringify({ ids: ['t-1'] }),
      })
      const evRes = await evidencePost(evReq)
      assert('anonymous POST /api/hermes/tasks/evidence returns 401', evRes.status === 401, `got ${evRes.status}`)

      const vfReq = new NextRequest('http://localhost:3001/api/hermes/tasks/verification', {
        method: 'POST',
        headers: { host: 'localhost:3001', 'content-type': 'application/json' },
        body: JSON.stringify({ ids: ['t-1'] }),
      })
      const vfRes = await verificationPost(vfReq)
      assert('anonymous POST /api/hermes/tasks/verification returns 401', vfRes.status === 401, `got ${vfRes.status}`)
    }

    // 11. Cron & toolsets return 503 unavailable (never synthetic 200) on failure in live mode
    {
      const origHermesHome = process.env.HERMES_HOME
      const origHermesBin = process.env.HERMES_BIN
      process.env.HERMES_HOME = 'C:\\nonexistent-hermes-home-99999'
      process.env.HERMES_BIN = 'nonexistent-hermes-bin-99999'
      try {
        const cronReq = new NextRequest('http://localhost:3001/api/hermes/cron', {
          method: 'GET',
          headers: { host: 'localhost:3001', cookie: `office_session=${viewerToken}` },
        })
        const cronRes = await cronGet(cronReq)
        const cronBody = (await cronRes.json()) as Record<string, unknown>
        assert(
          'GET /api/hermes/cron returns 503 unavailable on CLI failure (never synthetic 200)',
          cronRes.status === 503 && cronBody.unavailable === true && Array.isArray(cronBody.jobs) && cronBody.jobs.length === 0,
          `got ${cronRes.status}`,
        )

        const toolReq = new NextRequest('http://localhost:3001/api/hermes/toolsets', {
          method: 'GET',
          headers: { host: 'localhost:3001', cookie: `office_session=${viewerToken}` },
        })
        const toolRes = await toolsetsGet(toolReq)
        const toolBody = (await toolRes.json()) as Record<string, unknown>
        assert(
          'GET /api/hermes/toolsets returns 503 unavailable on CLI failure',
          toolRes.status === 503 && toolBody.unavailable === true && Array.isArray(toolBody.toolsets) && toolBody.toolsets.length === 0,
          `status=${toolRes.status}`,
        )
      } finally {
        process.env.HERMES_HOME = origHermesHome
        process.env.HERMES_BIN = origHermesBin
      }
    }
  } finally {
    process.env.STUDIO_ACCESS_TOKEN = origToken
    process.env.OFFICE_REQUIRE_WRITE_AUTH = origWriteAuth
    process.env.OFFICE_REQUIRE_READ_AUTH = origReadAuth
    process.env.STUDIO_SESSION_SECRET = origSecret
  }

  console.log(`\nResults: ${checks - failures}/${checks} checks passed.`)
  if (failures > 0) {
    process.exit(1)
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
