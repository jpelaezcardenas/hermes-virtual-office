import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { isDemoMode } from '@/lib/office/mode'

/**
 * Write guard for the office's mutating endpoints.
 *
 * WHY THIS FILE EXISTS: every action that changes something — kill, spawn, hide,
 * create a task, send a chat, start a meeting, rename the office — goes through
 * here. The office is normally opened at its PUBLIC address, but this guard once
 * allowed only loopback names, so every write from a real browser was answered
 * 403. Reads worked, which is exactly why the app looked alive but felt dead:
 * nothing you clicked did anything.
 *
 * TWO checks, and both are needed:
 *
 *   1. SAME-ORIGIN. The `Origin` header must name the very host being requested.
 *      This is the CSRF defence: a page on evil.example sends
 *      `Origin: http://evil.example`, which can never equal our `Host`.
 *
 *   2. A TRUSTED HOST. That host must be loopback or explicitly listed in
 *      `ALLOWED_ORIGINS`. This is the DNS-rebinding defence: an attacker who
 *      points evil.example at our IP gets `Host` and `Origin` to agree, but
 *      evil.example is not on the list.
 *
 *   3. OPTIONAL STUDIO WRITE AUTH & ROLE ENFORCEMENT (Audit Remedy A12):
 *      When `STUDIO_ACCESS_TOKEN` or `OFFICE_REQUIRE_WRITE_AUTH === 'true'` is set,
 *      mutating requests must carry a valid Studio token or delegated session cookie
 *      and satisfy the minimum office role rank (`viewer: 1, operator: 2, admin: 3`).
 */

export type OfficeRole = 'viewer' | 'operator' | 'admin'

const ROLE_RANK: Record<OfficeRole, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
}

/** Loopback names, always trusted for http:. */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Extra hosts allowed to write, from `ALLOWED_ORIGINS` in `.env.local`.
 *
 * Comma-separated `host[:port]` entries; a scheme prefix is tolerated so an
 * operator can paste a full origin. Example:
 *
 *   ALLOWED_ORIGINS=203.0.113.10:3300,office.example.com,https://studio.contexia.online
 */
function configuredHosts(): string[] {
  return (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, ''))
    .filter(Boolean)
}

/** Strip a trailing `:port`, leaving the bare host (handles `[::1]:3000`). */
function bareHost(host: string): string {
  return host.replace(/:\d+$/, '')
}

function isConfiguredHost(host: string): boolean {
  const normalized = host.toLowerCase()
  const bare = bareHost(normalized)
  return configuredHosts().some((entry) => entry === normalized || entry === bare)
}

function isTailscaleServeHost(host: string): boolean {
  const bare = bareHost(host.toLowerCase())
  if (!bare.endsWith('.ts.net')) return false
  return process.env.TAILSCALE_SERVE_ALLOWED === 'true' || isConfiguredHost(host)
}

function trustedHost(host: string, protocol: string): boolean {
  const normalized = host.toLowerCase()
  const bare = bareHost(normalized)
  if (protocol === 'http:') {
    if (LOOPBACK.has(bare)) return true
    return isConfiguredHost(normalized)
  }
  if (protocol === 'https:') {
    if (isConfiguredHost(normalized)) return true
    if (isTailscaleServeHost(normalized)) return true
    return false
  }
  return false
}

export function localOriginAllowed(hostHeader: string | null, originHeader: string | null): boolean {
  if (!hostHeader || !originHeader) return false

  try {
    const host = new URL(`http://${hostHeader}`)
    const origin = new URL(originHeader)
    // 1. same-origin: the Origin names the host being requested
    if (origin.host.toLowerCase() !== host.host.toLowerCase()) return false
    // 2. protocol must be http: or https:
    if (origin.protocol !== 'http:' && origin.protocol !== 'https:') return false
    // 3. and that host is one we trust for the given protocol
    return trustedHost(host.host, origin.protocol)
  } catch {
    return false
  }
}

export interface StudioSessionPayload {
  sub: string
  tenantId: string
  role: OfficeRole
  studioId: string
  exp: number
  jti: string
}

const EPHEMERAL_FALLBACK_SECRET = randomBytes(32).toString('hex')
const REVOKED_JTIS = new Map<string, number>()

function sessionSigningSecret(): string {
  const configured =
    (process.env.STUDIO_SESSION_SECRET || '').trim() ||
    (process.env.STUDIO_ACCESS_TOKEN || '').trim()
  return configured || EPHEMERAL_FALLBACK_SECRET
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(input: string): Buffer | null {
  try {
    const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
    const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad
    return Buffer.from(b64, 'base64')
  } catch {
    return null
  }
}

export function signStudioSession(
  input:
    | StudioSessionPayload
    | {
        sub: string
        tenantId: string
        role: OfficeRole
        studioId: string
        ttlSeconds?: number
        jti?: string
      },
): string {
  const nowSec = Math.floor(Date.now() / 1000)
  const payload: StudioSessionPayload =
    'exp' in input
      ? input
      : {
          sub: input.sub,
          tenantId: input.tenantId,
          role: input.role,
          studioId: input.studioId,
          exp: nowSec + (input.ttlSeconds ?? 900),
          jti: input.jti ?? randomUUID(),
        }
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const sig = createHmac('sha256', sessionSigningSecret()).update(encodedPayload).digest()
  return `${encodedPayload}.${base64UrlEncode(sig)}`
}

export function revokeStudioSession(jti: string, expUnixSec?: number): void {
  if (!jti) return
  const nowSec = Math.floor(Date.now() / 1000)
  for (const [key, exp] of REVOKED_JTIS.entries()) {
    if (exp <= nowSec) REVOKED_JTIS.delete(key)
  }
  REVOKED_JTIS.set(jti, expUnixSec ?? nowSec + 86400)
}

export function verifyStudioSession(token: string | null | undefined): StudioSessionPayload | null {
  if (!token) return null
  const parts = token.trim().split('.')
  if (parts.length !== 2) return null
  const [encodedPayload, encodedSig] = parts
  if (!encodedPayload || !encodedSig) return null

  const providedSig = base64UrlDecode(encodedSig)
  if (!providedSig) return null
  const expectedSig = createHmac('sha256', sessionSigningSecret()).update(encodedPayload).digest()
  if (providedSig.length !== expectedSig.length || !timingSafeEqual(providedSig, expectedSig)) {
    return null
  }

  const rawPayload = base64UrlDecode(encodedPayload)
  if (!rawPayload) return null
  try {
    const parsed = JSON.parse(rawPayload.toString('utf8')) as Partial<StudioSessionPayload>
    if (
      !parsed ||
      typeof parsed.sub !== 'string' ||
      typeof parsed.tenantId !== 'string' ||
      typeof parsed.studioId !== 'string' ||
      typeof parsed.jti !== 'string' ||
      typeof parsed.exp !== 'number' ||
      !(parsed.role && parsed.role in ROLE_RANK)
    ) {
      return null
    }
    const nowSec = Math.floor(Date.now() / 1000)
    if (parsed.exp <= nowSec) return null
    if (REVOKED_JTIS.has(parsed.jti)) return null
    return parsed as StudioSessionPayload
  } catch {
    return null
  }
}

export function extractOfficeSessionToken(req: Request): string | null {
  const headerVal = req.headers.get('x-office-session')?.trim()
  if (headerVal) return headerVal
  const cookieHeader = req.headers.get('cookie')
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith('office_session=')) {
      const val = trimmed.slice('office_session='.length).trim()
      if (val.length > 0) return decodeURIComponent(val)
    }
  }
  return null
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim())
  return match ? match[1].trim() : null
}

function resolveStudioCaller(req: Request): { authenticated: boolean; role?: OfficeRole; session?: StudioSessionPayload } {
  const studioToken = (process.env.STUDIO_ACCESS_TOKEN || '').trim()
  const headerToken = req.headers.get('x-studio-access-token')?.trim() || null
  const bearerToken = extractBearerToken(req.headers.get('authorization'))

  if (studioToken.length > 0 && (headerToken === studioToken || bearerToken === studioToken)) {
    return { authenticated: true, role: 'admin' }
  }

  const sessionToken = extractOfficeSessionToken(req) ?? bearerToken
  const verifiedSession = verifyStudioSession(sessionToken)
  if (verifiedSession) {
    return { authenticated: true, role: verifiedSession.role, session: verifiedSession }
  }

  return { authenticated: false }
}

export function assertStudioReadRequest(
  req: Request,
  minRole: OfficeRole = 'viewer',
): NextResponse | null {
  if (isDemoMode()) return null

  const studioToken = (process.env.STUDIO_ACCESS_TOKEN || '').trim()
  const isProd = process.env.NODE_ENV === 'production'
  const requireAuth =
    isProd ||
    studioToken.length > 0 ||
    process.env.OFFICE_REQUIRE_READ_AUTH === 'true' ||
    process.env.OFFICE_REQUIRE_WRITE_AUTH === 'true'

  if (!requireAuth) return null

  const caller = resolveStudioCaller(req)
  if (!caller.authenticated || !caller.role) {
    return NextResponse.json(
      {
        error: {
          code: 'unauthorized_studio_read',
          message: 'Studio read requires a valid STUDIO_ACCESS_TOKEN or signed office_session.',
          status: 401,
        },
      },
      { status: 401 },
    )
  }

  if (ROLE_RANK[caller.role] < ROLE_RANK[minRole]) {
    return NextResponse.json(
      {
        error: {
          code: 'insufficient_office_role',
          message: `Role "${caller.role}" does not satisfy minimum required role "${minRole}".`,
          status: 403,
        },
      },
      { status: 403 },
    )
  }

  return null
}

export function assertLocalWriteRequest(
  req: Request,
  requiredRole?: OfficeRole,
): NextResponse | null {
  if (isDemoMode()) {
    return NextResponse.json(
      {
        error: {
          code: 'demo_mode_read_only',
          message: 'Studio is in DEMO mode; write operations are disabled.',
          status: 403,
        },
      },
      { status: 403 },
    )
  }

  const host = req.headers.get('host')
  const origin = req.headers.get('origin')
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()

  // Reject protocol downgrade when behind an HTTPS reverse proxy / Tailscale Serve
  if (forwardedProto === 'https' && origin) {
    try {
      const parsedOrigin = new URL(origin)
      if (parsedOrigin.protocol === 'http:') {
        return NextResponse.json(
          {
            error: {
              code: 'forbidden_origin',
              message: `origin "${origin}" downgraded from https to http.`,
              status: 403,
            },
          },
          { status: 403 },
        )
      }
    } catch {
      // Fall through to standard origin check
    }
  }

  if (!localOriginAllowed(host, origin)) {
    // The message names the fix, because a silent 403 here is indistinguishable
    // from a broken button — which is precisely how this bug hid for so long.
    return NextResponse.json(
      {
        error: {
          code: 'forbidden_origin',
          message:
            `origin "${origin ?? '(tidak ada)'}" tidak diizinkan menulis. ` +
            `Tambahkan "${origin ?? host ?? 'host ini'}" ke ALLOWED_ORIGINS di .env.local, lalu restart.`,
          status: 403,
        },
      },
      { status: 403 },
    )
  }

  const studioToken = (process.env.STUDIO_ACCESS_TOKEN || '').trim()
  const requireWriteAuth = process.env.OFFICE_REQUIRE_WRITE_AUTH === 'true'

  if (studioToken.length > 0 || requireWriteAuth) {
    const caller = resolveStudioCaller(req)
    if (!caller.authenticated || !caller.role) {
      return NextResponse.json(
        {
          error: {
            code: 'unauthorized_studio_write',
            message: 'Studio write requires a valid STUDIO_ACCESS_TOKEN or signed office_session.',
            status: 401,
          },
        },
        { status: 401 },
      )
    }

    const effectiveMinRole: OfficeRole = requiredRole ?? 'operator'
    if (ROLE_RANK[caller.role] < ROLE_RANK[effectiveMinRole]) {
      return NextResponse.json(
        {
          error: {
            code: 'insufficient_office_role',
            message: `Role "${caller.role}" does not satisfy minimum required role "${effectiveMinRole}".`,
            status: 403,
          },
        },
        { status: 403 },
      )
    }
  }

  return null
}
