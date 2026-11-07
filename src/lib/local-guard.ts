import { NextResponse } from 'next/server'

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

function hasOfficeSessionCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .some((part) => {
      if (!part.startsWith('office_session=')) return false
      const val = part.slice('office_session='.length).trim()
      return val.length > 0
    })
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim())
  return match ? match[1].trim() : null
}

export function assertLocalWriteRequest(
  req: Request,
  requiredRole?: OfficeRole,
): NextResponse | null {
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
    const headerToken = req.headers.get('x-studio-access-token')?.trim() || null
    const bearerToken = extractBearerToken(req.headers.get('authorization'))
    const hasCookieSession = hasOfficeSessionCookie(req.headers.get('cookie'))
    const hasSessionHeader = Boolean(req.headers.get('x-office-session')?.trim())

    const tokenMatches =
      studioToken.length > 0 &&
      (headerToken === studioToken || bearerToken === studioToken)
    const sessionAuthenticated = hasCookieSession || hasSessionHeader || ( studioToken.length === 0 && Boolean(bearerToken) )

    if (!tokenMatches && !sessionAuthenticated) {
      return NextResponse.json(
        {
          error: {
            code: 'unauthorized_studio_write',
            message: 'Studio write requires a valid STUDIO_ACCESS_TOKEN or delegated office_session.',
            status: 401,
          },
        },
        { status: 401 },
      )
    }

    const roleHeader = req.headers.get('x-office-role')?.trim().toLowerCase() as OfficeRole | undefined
    if (requiredRole !== undefined || (requireWriteAuth && roleHeader !== undefined)) {
      const effectiveMinRole: OfficeRole = requiredRole ?? 'operator'
      const callerRole: OfficeRole | undefined =
        roleHeader && roleHeader in ROLE_RANK
          ? roleHeader
          : requiredRole !== undefined
            ? undefined
            : 'operator'

      if (!callerRole || ROLE_RANK[callerRole] < ROLE_RANK[effectiveMinRole]) {
        return NextResponse.json(
          {
            error: {
              code: 'insufficient_office_role',
              message: `Role "${callerRole ?? 'none'}" does not satisfy minimum required role "${effectiveMinRole}".`,
              status: 403,
            },
          },
          { status: 403 },
        )
      }
    }
  }

  return null
}
