import { NextRequest, NextResponse } from 'next/server'
import {
  localOriginAllowed,
  signStudioSession,
  type OfficeRole,
} from '@/lib/local-guard'
import { isDemoMode } from '@/lib/office/mode'

export const dynamic = 'force-dynamic'

const VALID_ROLES = new Set<OfficeRole>(['viewer', 'operator', 'admin'])

export async function POST(req: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json(
      { error: { code: 'demo_mode_read_only', message: 'Session redeem disabled in DEMO mode.', status: 403 } },
      { status: 403 },
    )
  }

  const host = req.headers.get('host')
  const origin = req.headers.get('origin')
  if (origin && !localOriginAllowed(host, origin)) {
    return NextResponse.json(
      { error: { code: 'forbidden_origin', message: 'Origin not allowed to redeem session.', status: 403 } },
      { status: 403 },
    )
  }

  let body: { code?: string; nonce?: string; studio_id?: string }
  try {
    body = (await req.json()) as { code?: string; nonce?: string; studio_id?: string }
  } catch {
    return NextResponse.json(
      { error: { code: 'invalid_request', message: 'Invalid JSON body.', status: 400 } },
      { status: 400 },
    )
  }

  const code = typeof body.code === 'string' ? body.code.trim() : ''
  const nonce = typeof body.nonce === 'string' ? body.nonce.trim() : ''
  if (!code || !nonce) {
    return NextResponse.json(
      { error: { code: 'invalid_request', message: 'code and nonce are required.', status: 400 } },
      { status: 400 },
    )
  }

  const backendBase = (process.env.CONTEXIA_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '')
  const studioId = body.studio_id?.trim() || process.env.STUDIO_ID || 'contexia-hermes-studio'
  const studioCredential = (process.env.STUDIO_ACCESS_TOKEN || '').trim()

  try {
    const upstream = await fetch(`${backendBase}/api/v1/office/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(studioCredential ? { 'X-Studio-Credential': studioCredential } : {}),
      },
      body: JSON.stringify({
        code,
        nonce,
        studio_id: studioId,
        origin: origin || `https://${host || 'localhost'}`,
        studio_credential: studioCredential,
      }),
    })

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '')
      return NextResponse.json(
        { error: { code: 'redeem_rejected', message: errText || 'Launch token rejected by backend.', status: upstream.status } },
        { status: upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502 },
      )
    }

    const data = (await upstream.json()) as {
      user_id: string
      tenant_id: string
      role: string
      studio_id: string
      expires_at?: number
    }

    const role: OfficeRole = VALID_ROLES.has(data.role as OfficeRole) ? (data.role as OfficeRole) : 'viewer'
    const ttlSeconds = data.expires_at
      ? Math.max(60, Math.floor(data.expires_at - Date.now() / 1000))
      : 900

    const signedCookie = signStudioSession({
      sub: data.user_id,
      tenantId: data.tenant_id,
      role,
      studioId: data.studio_id || studioId,
      ttlSeconds,
    })

    const isHttps =
      req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase() === 'https' ||
      req.nextUrl.protocol === 'https:'

    const res = NextResponse.json({
      ok: true,
      role,
      studio_id: data.studio_id || studioId,
      expires_at: data.expires_at ?? Math.floor(Date.now() / 1000) + ttlSeconds,
    })
    res.cookies.set('office_session', signedCookie, {
      httpOnly: true,
      sameSite: isHttps ? 'none' : 'lax',
      secure: isHttps,
      path: '/',
      maxAge: ttlSeconds,
    })
    return res
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: 'backend_unreachable',
          message: err instanceof Error ? err.message : 'Failed to contact Contexia backend.',
          status: 502,
        },
      },
      { status: 502 },
    )
  }
}
