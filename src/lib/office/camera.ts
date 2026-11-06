/**
 * Camera Presets, Calibration & Floor Levels — Task 9.2 / Task 9.6
 *
 * Implements persistent definitions for the four official camera presets:
 * - Overall office (office-3d.jpg)
 * - Courtyard & Pool (office-courtyard.jpg)
 * - East wing lounge & dining (office-lounge.jpg)
 * - Upper floor & CEO suite (office-upper-floor.jpg)
 *
 * Invariants:
 * - Exactly two occupied levels: Level 0 (ground) and Level 1 (upper north bar).
 * - Roof rim datum at 6.8m (LEVELS = 2, LEVEL_H = 3.4) is decorative trim;
 *   strictly no third occupied terrace or infrastructure tower.
 * - Calibrated against the founder's 2000x1000 reference images and responsive
 *   mobile framing (390x844).
 */

export const LEVELS = 2
export const LEVEL_H = 3.4
export const ROOF_Y = 6.8 // decorative rim datum (LEVELS * LEVEL_H)
export const OCCUPIED_LEVELS = [0, 1] as const

export type CameraPresetId = 'overall' | 'courtyard' | 'lounge' | 'upper-floor'

export interface CameraViewport {
  width: number
  height: number
}

export interface CameraPreset {
  id: CameraPresetId
  name: string
  description: string
  position: { x: number; y: number; z: number }
  target: { x: number; y: number; z: number }
  fov: number
  zoom: number
  minDistance: number
  maxDistance: number
  referenceImage: string
  referenceSha256: string
  desktopViewport: CameraViewport
  mobileViewport: CameraViewport
}

export const OFFICIAL_DESKTOP_VIEWPORT: CameraViewport = {
  width: 2000,
  height: 1000,
}

export const OFFICIAL_MOBILE_VIEWPORT: CameraViewport = {
  width: 390,
  height: 844,
}

export const OFFICIAL_REFERENCE_HASHES: Record<string, string> = {
  'office-3d.jpg': '5993BCDD3556A93061A3EBEEB6146523E86C56203C9BA435020370B549C8A304',
  'office-courtyard.jpg': '3C2D197A187C551BF126E6B5BFD52C2094E531C58FD79E337159575BD2F67252',
  'office-lounge.jpg': 'AA7C91A1E7D6F0FE80B36E5ABA78F3D9B273477DA1AD28103ED849F267AF3A91',
  'office-upper-floor.jpg': '6D768BB636246E2C6AD5BFDA07B37D0F48A554B26F190D1B349A5ED1C31D6324',
}

export const CAMERA_PRESETS: Record<CameraPresetId, CameraPreset> = {
  overall: {
    id: 'overall',
    name: 'Overall Office',
    description: 'Elevated oblique view across the complete building from southeast',
    position: { x: 14, y: 34, z: 40 },
    target: { x: 0, y: 1.5, z: -2 },
    fov: 45,
    zoom: 1.0,
    minDistance: 6,
    maxDistance: 95,
    referenceImage: 'office-3d.jpg',
    referenceSha256: OFFICIAL_REFERENCE_HASHES['office-3d.jpg'],
    desktopViewport: OFFICIAL_DESKTOP_VIEWPORT,
    mobileViewport: OFFICIAL_MOBILE_VIEWPORT,
  },
  courtyard: {
    id: 'courtyard',
    name: 'Courtyard & Pool',
    description: 'Ground vantage across pool, gym, planters, and stair toward upper corridor',
    position: { x: 0, y: 8, z: 15 },
    target: { x: 0, y: 2.5, z: -4 },
    fov: 50,
    zoom: 1.0,
    minDistance: 4,
    maxDistance: 60,
    referenceImage: 'office-courtyard.jpg',
    referenceSha256: OFFICIAL_REFERENCE_HASHES['office-courtyard.jpg'],
    desktopViewport: OFFICIAL_DESKTOP_VIEWPORT,
    mobileViewport: OFFICIAL_MOBILE_VIEWPORT,
  },
  lounge: {
    id: 'lounge',
    name: 'East Wing Lounge',
    description: 'East wing dining & leisure vantage across courtyard toward gym and upper floor',
    position: { x: 20, y: 7, z: 12 },
    target: { x: 2, y: 2.5, z: -4 },
    fov: 55,
    zoom: 1.0,
    minDistance: 4,
    maxDistance: 60,
    referenceImage: 'office-lounge.jpg',
    referenceSha256: OFFICIAL_REFERENCE_HASHES['office-lounge.jpg'],
    desktopViewport: OFFICIAL_DESKTOP_VIEWPORT,
    mobileViewport: OFFICIAL_MOBILE_VIEWPORT,
  },
  'upper-floor': {
    id: 'upper-floor',
    name: 'Upper Floor & CEO',
    description: 'Close view of upper level corridor, CEO suite, and Rinjani room',
    position: { x: -12, y: 6.2, z: -6 },
    target: { x: -20, y: 4.5, z: -16 },
    fov: 45,
    zoom: 1.0,
    minDistance: 3,
    maxDistance: 50,
    referenceImage: 'office-upper-floor.jpg',
    referenceSha256: OFFICIAL_REFERENCE_HASHES['office-upper-floor.jpg'],
    desktopViewport: OFFICIAL_DESKTOP_VIEWPORT,
    mobileViewport: OFFICIAL_MOBILE_VIEWPORT,
  },
}

export function getCameraPreset(id: CameraPresetId): CameraPreset {
  const preset = CAMERA_PRESETS[id]
  if (!preset) {
    throw new Error(`Unknown camera preset ID: ${id}`)
  }
  return preset
}

export function listCameraPresets(): CameraPreset[] {
  return [
    CAMERA_PRESETS.overall,
    CAMERA_PRESETS.courtyard,
    CAMERA_PRESETS.lounge,
    CAMERA_PRESETS['upper-floor'],
  ]
}

export function computeAspectRatio(viewport: CameraViewport): number {
  if (viewport.height <= 0) return 1.0
  return viewport.width / viewport.height
}

export function isMobileViewport(width: number, height: number): boolean {
  return width < 768 || width < height
}

/**
 * Returns true strictly for the two occupied levels (0 = ground, 1 = upper north bar).
 * Rejects levels >= 2 (level 2 is decorative roof rim datum, not occupied).
 */
export function isOccupiedLevel(level: number): boolean {
  return level === 0 || level === 1
}

/**
 * Validates floor level requests against the two-occupied-level invariant.
 * Explicitly rejects level >= 2 or terrace/tower requests with clear explanations.
 */
export function validateFloorLevel(level: number): { valid: boolean; error?: string } {
  if (level === 0) {
    return { valid: true }
  }
  if (level === 1) {
    return { valid: true }
  }
  if (level === 2) {
    return {
      valid: false,
      error: 'Level 2 does not exist as an occupied floor; 6.8m datum is strictly a decorative roof rim trim.',
    }
  }
  if (level < 0) {
    return {
      valid: false,
      error: 'Negative levels are not supported. Only levels 0 and 1 are occupied.',
    }
  }
  return {
    valid: false,
    error: `Level ${level} does not exist. The building strictly has two occupied levels (0 and 1); no terrace or tower.`,
  }
}

/**
 * Structural interfaces for camera and controls to remain decoupled from full Three.js imports in test runners.
 */
export interface CameraLike {
  position: { set: (x: number, y: number, z: number) => void; x: number; y: number; z: number }
  fov: number
  zoom: number
  aspect: number
  updateProjectionMatrix: () => void
}

export interface OrbitControlsLike {
  target: { set: (x: number, y: number, z: number) => void; x: number; y: number; z: number }
  minDistance: number
  maxDistance: number
  update?: () => void
}

export interface ApplyPresetOptions {
  reducedMotion?: boolean
}

/**
 * CameraManager controls the perspective camera & OrbitControls, applies presets,
 * and maintains the active preset calibrated across viewport resizes.
 */
export class CameraManager {
  private activePresetId: CameraPresetId = 'overall'
  private camera: CameraLike
  private controls: OrbitControlsLike
  private animationFrameId: number | null = null

  constructor(camera: CameraLike, controls: OrbitControlsLike, initialPreset: CameraPresetId = 'overall') {
    this.camera = camera
    this.controls = controls
    this.applyPreset(initialPreset, false)
  }

  getActivePresetId(): CameraPresetId {
    return this.activePresetId
  }

  getActivePreset(): CameraPreset {
    return getCameraPreset(this.activePresetId)
  }

  applyPreset(id: CameraPresetId, animate = false, options?: ApplyPresetOptions): CameraPreset {
    const preset = getCameraPreset(id)
    this.activePresetId = id

    const prefersReducedMotion =
      options?.reducedMotion ??
      (typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches)

    const shouldAnimate = animate && !prefersReducedMotion

    if (this.animationFrameId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    if (!shouldAnimate || typeof requestAnimationFrame === 'undefined') {
      this.camera.position.set(preset.position.x, preset.position.y, preset.position.z)
      this.controls.target.set(preset.target.x, preset.target.y, preset.target.z)
      this.camera.fov = preset.fov
      this.camera.zoom = preset.zoom
      this.controls.minDistance = preset.minDistance
      this.controls.maxDistance = preset.maxDistance
      this.camera.updateProjectionMatrix()
      this.controls.update?.()
      return preset
    }

    // Smooth camera transition
    const startPos = { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z }
    const startTarget = { x: this.controls.target.x, y: this.controls.target.y, z: this.controls.target.z }
    const startFov = this.camera.fov
    const startZoom = this.camera.zoom
    const duration = 300
    const startTime = (typeof performance !== 'undefined' ? performance.now() : Date.now())

    const step = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(1.0, elapsed / duration)
      // easeOutCubic
      const ease = 1 - Math.pow(1 - progress, 3)

      this.camera.position.set(
        startPos.x + (preset.position.x - startPos.x) * ease,
        startPos.y + (preset.position.y - startPos.y) * ease,
        startPos.z + (preset.position.z - startPos.z) * ease,
      )
      this.controls.target.set(
        startTarget.x + (preset.target.x - startTarget.x) * ease,
        startTarget.y + (preset.target.y - startTarget.y) * ease,
        startTarget.z + (preset.target.z - startTarget.z) * ease,
      )
      this.camera.fov = startFov + (preset.fov - startFov) * ease
      this.camera.zoom = startZoom + (preset.zoom - startZoom) * ease
      this.camera.updateProjectionMatrix()
      this.controls.update?.()

      if (progress < 1.0) {
        this.animationFrameId = requestAnimationFrame(step)
      } else {
        this.controls.minDistance = preset.minDistance
        this.controls.maxDistance = preset.maxDistance
        this.animationFrameId = null
      }
    }

    this.animationFrameId = requestAnimationFrame(step)
    return preset
  }

  handleResize(width: number, height: number): void {
    if (height <= 0) return
    this.camera.aspect = width / height
    const preset = this.getActivePreset()
    // Retain calibrated FOV & zoom for active preset
    this.camera.fov = preset.fov
    this.camera.zoom = preset.zoom
    this.camera.updateProjectionMatrix()
  }
}
