/**
 * Camera Presets & Calibration — Task 9.2 / Task 9.6
 *
 * Implements persistent definitions for the four official camera presets:
 * - Overall office (office-3d.jpg)
 * - Courtyard & Pool (office-courtyard.jpg)
 * - East wing lounge & dining (office-lounge.jpg)
 * - Upper floor & CEO suite (office-upper-floor.jpg)
 *
 * Calibrated against the founder's 2000x1000 reference images and responsive
 * mobile framing (390x844).
 */

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
