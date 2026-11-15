import { NextRequest, NextResponse } from 'next/server'
import {
  assertLocalWriteRequest,
  extractOfficeSessionToken,
  revokeStudioSession,
  verifyStudioSession,
} from '@/lib/local-guard'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const denied = assertLocalWriteRequest(req, 'viewer')
  if (denied) return denied

  const token = extractOfficeSessionToken(req)
  const payload = verifyStudioSession(token)
  if (payload) {
    revokeStudioSession(payload.jti, payload.exp)
  }

  const res = NextResponse.json({ revoked: true })
  res.cookies.set('office_session', '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  })
  return res
}
