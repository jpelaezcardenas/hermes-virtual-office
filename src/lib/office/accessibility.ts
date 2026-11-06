/**
 * Accessibility, Reduced Motion, Keyboard & WebGL Fallback utilities.
 *
 * Task 9.16 of bunker-virtual-office OpenSpec change.
 *
 * Invariants:
 * 1. Reduced motion: instant camera snaps (cameraAnimationDurationMs = 0), lerp disabled.
 * 2. WebGL fallback: demotes 3D to 2D / Kanban, displays explicit Indonesian scene-unavailable banner:
 *    "Akselerasi 3D (WebGL) tidak tersedia di perangkat ini. Kantor dialihkan ke mode 2D / Kanban."
 *    All operational panels remain reachable without 3D interaction.
 * 3. Mobile viewport & touch targets: single_column_panels = true when viewportWidth < 640px,
 *    touch targets >= 44px on mobile/touch screens.
 * 4. Hidden tab rendering throttle: throttleWhenHidden = true pauses render loops on backgrounded tabs.
 * 5. Full keyboard navigation: '1'-'7', 'm', 'c', 'n', 'p', 'b', 's', and 'Escape'.
 */

export const DEFAULT_CAMERA_ANIMATION_DURATION_MS = 800
export const REDUCED_MOTION_ANIMATION_DURATION_MS = 0
export const MOBILE_VIEWPORT_BREAKPOINT = 640
export const MOBILE_TOUCH_TARGET_MIN_PX = 44
export const DESKTOP_TOUCH_TARGET_MIN_PX = 32

export const WEBGL_UNAVAILABLE_BANNER =
  'Akselerasi 3D (WebGL) tidak tersedia di perangkat ini. Kantor dialihkan ke mode 2D / Kanban.'

export interface ClientCapabilities {
  hasWebGL: boolean
  prefersReducedMotion: boolean
  viewportWidth: number
  viewportHeight: number
  isTouchDevice?: boolean
  effectiveViewMode?: '3d' | '2d' | 'sprite'
}

export interface RenderPolicy {
  throttleWhenHidden: boolean
  cameraAnimationDurationMs: number
  canvasVisible: boolean
  fallbackBannerMessage: string | null
  touchTargetMinPx: number
  singleColumnPanels: boolean
  effectiveViewMode: '3d' | '2d' | 'sprite'
}

export function isReducedMotionPreferred(override?: boolean): boolean {
  if (typeof override === 'boolean') return override
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }
  return false
}

export function isWebGLAvailable(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return Boolean(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    )
  } catch {
    return false
  }
}

export function deriveRenderPolicy(caps: ClientCapabilities): RenderPolicy {
  const isNarrow = caps.viewportWidth < MOBILE_VIEWPORT_BREAKPOINT
  const isTouch = Boolean(caps.isTouchDevice) || isNarrow

  let effectiveMode: '3d' | '2d' | 'sprite' = caps.effectiveViewMode || '3d'
  let canvasVisible = true
  let fallbackBannerMessage: string | null = null

  if (!caps.hasWebGL) {
    if (effectiveMode === '3d') {
      effectiveMode = '2d'
    }
    canvasVisible = false
    fallbackBannerMessage = WEBGL_UNAVAILABLE_BANNER
  } else {
    canvasVisible = effectiveMode === '3d'
  }

  const cameraAnimMs = caps.prefersReducedMotion
    ? REDUCED_MOTION_ANIMATION_DURATION_MS
    : DEFAULT_CAMERA_ANIMATION_DURATION_MS

  return {
    throttleWhenHidden: true,
    cameraAnimationDurationMs: cameraAnimMs,
    canvasVisible,
    fallbackBannerMessage,
    touchTargetMinPx: isTouch ? MOBILE_TOUCH_TARGET_MIN_PX : DESKTOP_TOUCH_TARGET_MIN_PX,
    singleColumnPanels: isNarrow,
    effectiveViewMode: effectiveMode,
  }
}

export interface KeyboardShortcutActionMap {
  onSetView?: (view: '3d' | '2d' | 'sprite') => void
  onCameraPreset?: (preset: 'overall' | 'courtyard' | 'lounge' | 'upper-floor') => void
  onToggleMeeting?: () => void
  onToggleChat?: () => void
  onToggleApproval?: () => void
  onToggleBoard?: () => void
  onToggleSystem?: () => void
  onNewTask?: () => void
  onEscape?: () => void
}

export function handleKeyboardShortcut(
  key: string,
  actions: KeyboardShortcutActionMap,
  targetTag?: string
): boolean {
  const tag = (targetTag || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return false
  }

  switch (key) {
    case 'Escape':
      actions.onEscape?.()
      return true
    case '1':
      actions.onSetView?.('sprite')
      return true
    case '2':
      actions.onSetView?.('2d')
      return true
    case '3':
      actions.onSetView?.('3d')
      return true
    case '4':
      actions.onCameraPreset?.('overall')
      return true
    case '5':
      actions.onCameraPreset?.('courtyard')
      return true
    case '6':
      actions.onCameraPreset?.('lounge')
      return true
    case '7':
      actions.onCameraPreset?.('upper-floor')
      return true
    case 'm':
    case 'M':
      actions.onToggleMeeting?.()
      return true
    case 'c':
    case 'C':
      actions.onToggleChat?.()
      return true
    case 'p':
    case 'P':
      actions.onToggleApproval?.()
      return true
    case 'b':
    case 'B':
      actions.onToggleBoard?.()
      return true
    case 's':
    case 'S':
      actions.onToggleSystem?.()
      return true
    case 'n':
    case 'N':
      actions.onNewTask?.()
      return true
    default:
      return false
  }
}
