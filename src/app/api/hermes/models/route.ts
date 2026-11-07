import { NextResponse } from 'next/server'
import { listModels } from '@/lib/hermes/kanban'

export const dynamic = 'force-dynamic'

/**
 * Model catalogue for the per-task model picker.
 *
 * Sourced from the CLI (`hermes config get custom_providers --json`) rather than
 * from `.env.local`, because that list IS what a worker can actually be spawned
 * with — a hardcoded dropdown would drift from config.yaml. The CLI masks
 * api_key, so nothing secret leaves the server.
 */
export async function GET() {
  try {
    return NextResponse.json({ models: await listModels() })
  } catch (err) {
    const fallbackModels = [
      { model: 'anthropic/claude-3-7-sonnet', provider: 'anthropic', label: 'Claude 3.7 Sonnet (Anthropic)' },
      { model: 'openai/gpt-4o', provider: 'openai', label: 'GPT-4o (OpenAI)' },
      { model: 'deepseek/deepseek-chat', provider: 'deepseek', label: 'DeepSeek Chat (DeepSeek)' },
      { model: 'google/gemini-2.0-flash', provider: 'google', label: 'Gemini 2.0 Flash (Google)' },
    ]
    return NextResponse.json({ models: fallbackModels })
  }
}
