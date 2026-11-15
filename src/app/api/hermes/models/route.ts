import { NextRequest, NextResponse } from 'next/server'
import { listModels } from '@/lib/hermes/kanban'
import { assertStudioReadRequest } from '@/lib/local-guard'
import { isDemoMode } from '@/lib/office/mode'

export const dynamic = 'force-dynamic'

/**
 * Model catalogue for the per-task model picker.
 *
 * Sourced from the CLI (`hermes config get custom_providers --json`) rather than
 * from `.env.local`, because that list IS what a worker can actually be spawned
 * with — a hardcoded dropdown would drift from config.yaml. The CLI masks
 * api_key, so nothing secret leaves the server.
 */
export async function GET(req: NextRequest) {
  const denied = assertStudioReadRequest(req)
  if (denied) return denied

  if (isDemoMode()) {
    return NextResponse.json({
      models: [
        { model: 'demo/synthetic', provider: 'demo', label: 'Demo Model (Read-Only)' },
      ],
      demo: true,
      mode: 'demo',
    })
  }

  try {
    return NextResponse.json({ models: await listModels(), demo: false, mode: 'live' })
  } catch (err) {
    return NextResponse.json(
      {
        models: [],
        demo: false,
        mode: 'live',
        unavailable: true,
        observedAt: new Date().toISOString(),
        reason: err instanceof Error ? err.message : 'hermes_models_unavailable',
      },
      { status: 503 },
    )
  }
}
