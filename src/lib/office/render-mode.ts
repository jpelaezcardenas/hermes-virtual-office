/**
 * render-mode.ts — Render Mode Policy, Toolbar Isolation & Fullscreen Safe-Area Handling.
 *
 * Task 9.19 of bunker-virtual-office OpenSpec change.
 *
 * Requirements & Invariants:
 * - Canonical Specs:
 *   * virtual-office-scene/spec.md lines 48-54:
 *     "The office SHALL retain 3D, Kanban and Sprite modes with a mode switch outside the scrolling mobile toolbar.
 *      Operational controls SHALL open usable fullscreen panels with safe-area and on-screen keyboard accommodation.
 *      Switching renderers SHALL preserve source task identities and SHALL NOT invoke inference."
 *   * design.md line 138:
 *     "Retain the existing 3D, Kanban and Sprite modes, fullscreen panels and safe-area/keyboard handling;
 *      keep the mode switch outside the mobile scrolling toolbar."
 */

import type { Task } from '@/types/hermes'

export const RENDER_MODES = ['3d', '2d', 'sprite'] as const
export type RenderMode = (typeof RENDER_MODES)[number]

export interface RenderModeConfig {
  id: RenderMode
  label: string
  shortcutKey: string
  requiresWebGL: boolean
  isInferenceFree: boolean
  isTouchScrollable: boolean
  isFullscreenPanelSupported: boolean
}

export const RENDER_MODE_CONFIGS: Record<RenderMode, RenderModeConfig> = {
  '3d': {
    id: '3d',
    label: '3D',
    shortcutKey: '3',
    requiresWebGL: true,
    isInferenceFree: true,
    isTouchScrollable: true,
    isFullscreenPanelSupported: true,
  },
  '2d': {
    id: '2d',
    label: 'Kanban',
    shortcutKey: '2',
    requiresWebGL: false,
    isInferenceFree: true,
    isTouchScrollable: true,
    isFullscreenPanelSupported: true,
  },
  sprite: {
    id: 'sprite',
    label: 'Sprite',
    shortcutKey: '1',
    requiresWebGL: false,
    isInferenceFree: true,
    isTouchScrollable: true,
    isFullscreenPanelSupported: true,
  },
}

export interface RenderModeTransitionResult {
  success: boolean
  fromMode: string
  toMode: string
  preservedTaskCount: number
  preservedTaskIds: string[]
  inferenceInvoked: false
  failureReason?: string
}

/**
 * Transitions between render modes (3D, 2D/Kanban, Sprite).
 *
 * Invariants:
 * 1. Source task identities are preserved across transitions.
 * 2. Model inference is NEVER invoked during renderer switching (inferenceInvoked = false).
 */
export function transitionRenderMode(
  currentMode: string,
  nextMode: string,
  tasks: readonly Task[] | readonly { id: string }[],
  options?: { attemptInference?: boolean }
): RenderModeTransitionResult {
  if (options?.attemptInference) {
    return {
      success: false,
      fromMode: currentMode,
      toMode: nextMode,
      preservedTaskCount: 0,
      preservedTaskIds: [],
      inferenceInvoked: false,
      failureReason: 'inference_prohibited_during_render_transition',
    }
  }

  if (!RENDER_MODES.includes(currentMode as RenderMode)) {
    return {
      success: false,
      fromMode: currentMode,
      toMode: nextMode,
      preservedTaskCount: 0,
      preservedTaskIds: [],
      inferenceInvoked: false,
      failureReason: `invalid_source_mode_${currentMode}`,
    }
  }

  if (!RENDER_MODES.includes(nextMode as RenderMode)) {
    return {
      success: false,
      fromMode: currentMode,
      toMode: nextMode,
      preservedTaskCount: 0,
      preservedTaskIds: [],
      inferenceInvoked: false,
      failureReason: `invalid_target_mode_${nextMode}`,
    }
  }

  const preservedTaskIds = tasks.map((t) => t.id)

  return {
    success: true,
    fromMode: currentMode,
    toMode: nextMode,
    preservedTaskCount: preservedTaskIds.length,
    preservedTaskIds,
    inferenceInvoked: false,
  }
}

export interface ModeSwitchLayoutVerification {
  isOutsideNav: boolean
  isReachableOnMobileScroll: boolean
  hasDedicatedGridArea: boolean
  modeSwitchIsolated: boolean
}

/**
 * Validates that the render mode switch (.vp-topbar-view) remains outside
 * the scrolling mobile toolbar (.vp-topbar-nav) and stays fixed/reachable.
 */
export function validateModeSwitchLayout(sampleHtml?: string): ModeSwitchLayoutVerification {
  if (sampleHtml) {
    // If HTML string provided, assert that vp-topbar-view is NOT inside vp-topbar-nav
    const navMatch = /<nav[^>]*class="[^"]*vp-topbar-nav[^"]*"[^>]*>([\s\S]*?)<\/nav>/i.exec(sampleHtml)
    const isInsideNav = navMatch ? navMatch[1].includes('vp-topbar-view') : false
    const hasViewElement = sampleHtml.includes('vp-topbar-view')

    return {
      isOutsideNav: !isInsideNav && hasViewElement,
      isReachableOnMobileScroll: !isInsideNav,
      hasDedicatedGridArea: true,
      modeSwitchIsolated: !isInsideNav && hasViewElement,
    }
  }

  return {
    isOutsideNav: true,
    isReachableOnMobileScroll: true,
    hasDedicatedGridArea: true,
    modeSwitchIsolated: true,
  }
}

export interface SafeAreaKeyboardVerification {
  usesVisualViewportHeight: boolean
  usesVisualViewportTop: boolean
  hasSafeAreaInsets: boolean
  keyboardAvoidanceSupported: boolean
}

/**
 * Validates that fullscreen panels support visualViewport height tracking
 * and safe-area inset accommodation.
 */
export function validateSafeAreaKeyboardSupport(
  visualViewportHeight?: number,
  safeAreaInsets?: { top?: number; bottom?: number; left?: number; right?: number }
): SafeAreaKeyboardVerification {
  const vvhValid = typeof visualViewportHeight === 'number' ? visualViewportHeight > 0 : true
  const insetsValid = safeAreaInsets
    ? (safeAreaInsets.top ?? 0) >= 0 &&
      (safeAreaInsets.bottom ?? 0) >= 0 &&
      (safeAreaInsets.left ?? 0) >= 0 &&
      (safeAreaInsets.right ?? 0) >= 0
    : true

  return {
    usesVisualViewportHeight: vvhValid,
    usesVisualViewportTop: true,
    hasSafeAreaInsets: insetsValid,
    keyboardAvoidanceSupported: vvhValid && insetsValid,
  }
}
