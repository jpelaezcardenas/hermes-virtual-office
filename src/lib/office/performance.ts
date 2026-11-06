/**
 * performance.ts — Performance Profiling, Memory Telemetry, Device Pixel Ratio (DPR)
 * Tuning & Render Cadence Policy for Bunker Virtual Office.
 *
 * Task 9.17 of bunker-virtual-office OpenSpec change.
 *
 * Invariants & Policies:
 * 1. Measured results documented honestly without claiming universal 60 FPS across all devices.
 *    (claimsUniversal60Fps strictly false).
 * 2. High DPR on mobile/retina (3.0+) capped to <= 2.0 (quality 2), <= 1.5 (quality 1),
 *    and 1.0 (quality 0 or low-end device class) to prevent GPU and thermal exhaustion.
 * 3. Render cadence & quality automatically degrade when mean frame time > 38.0ms or FPS < 26.
 *    Severe degradation (> 60ms or FPS < 15) forces quality 0 and 30 FPS target cadence.
 * 4. Background tabs throttle to 0 FPS (throttleBackground: true).
 */

export const MAX_CAPPED_DPR_HIGH = 2.0
export const MAX_CAPPED_DPR_MEDIUM = 1.5
export const MAX_CAPPED_DPR_LOW = 1.0

export const QUALITY_DEGRADE_FRAME_TIME_MS = 38.0
export const QUALITY_DEGRADE_FPS_THRESHOLD = 26.0
export const SEVERE_DEGRADE_FRAME_TIME_MS = 60.0
export const SEVERE_DEGRADE_FPS_THRESHOLD = 15.0

export const MAX_FRAME_SAMPLES = 120

export type DeviceClass = 'desktop' | 'mobile' | 'tablet' | 'low_end'

export interface PerformanceMetrics {
  meanFrameTimeMs: number
  p95FrameTimeMs: number
  minFrameTimeMs: number
  maxFrameTimeMs: number
  measuredFps: number
  sampleCount: number
  heapUsedMb?: number
  geometries: number
  textures: number
  calls: number
  triangles: number
  claimsUniversal60Fps: false
}

export interface RenderCadencePolicy {
  targetCadenceFps: number
  cappedDpr: number
  shadowsEnabled: boolean
  shadowMapSize: number
  throttleBackground: boolean
  qualityLevel: number
  claimsUniversal60Fps: false
}

export function detectDeviceClass(
  width: number,
  isTouch?: boolean,
  hardwareConcurrency?: number
): DeviceClass {
  // Budget / low concurrency hint
  if (hardwareConcurrency !== undefined && hardwareConcurrency <= 2) {
    return 'low_end'
  }
  if (width < 640) {
    return 'mobile'
  }
  if (width < 1024 && isTouch) {
    return 'tablet'
  }
  return 'desktop'
}

/**
 * Derives the optimal render cadence, shadow resolution, and capped DPR based on
 * device class, requested quality level, and observed performance metrics.
 *
 * Invariant: Never claims universal 60 FPS.
 */
export function tuneRenderCadence(
  deviceClass: DeviceClass,
  devicePixelRatio: number,
  quality: number,
  metrics?: Partial<PerformanceMetrics>
): RenderCadencePolicy {
  let targetQuality = Math.max(0, Math.min(2, quality))

  if (deviceClass === 'low_end') {
    targetQuality = Math.min(targetQuality, 1)
  }

  // Auto-degradation based on observed frame times / fps
  if (metrics) {
    const meanMs = metrics.meanFrameTimeMs ?? 0
    const fps = metrics.measuredFps ?? 0

    if (
      (meanMs > 0 && meanMs > SEVERE_DEGRADE_FRAME_TIME_MS) ||
      (fps > 0 && fps < SEVERE_DEGRADE_FPS_THRESHOLD)
    ) {
      targetQuality = 0
    } else if (
      (meanMs > 0 && meanMs > QUALITY_DEGRADE_FRAME_TIME_MS) ||
      (fps > 0 && fps < QUALITY_DEGRADE_FPS_THRESHOLD)
    ) {
      if (targetQuality > 1) {
        targetQuality = 1
      }
    }
  }

  // DPR Capping
  let cappedDpr: number
  if (targetQuality === 2) {
    cappedDpr = Math.min(devicePixelRatio, MAX_CAPPED_DPR_HIGH)
  } else if (targetQuality === 1) {
    if (deviceClass === 'low_end') {
      cappedDpr = Math.min(devicePixelRatio, MAX_CAPPED_DPR_LOW)
    } else {
      cappedDpr = Math.min(devicePixelRatio, MAX_CAPPED_DPR_MEDIUM)
    }
  } else {
    cappedDpr = Math.min(devicePixelRatio, MAX_CAPPED_DPR_LOW)
  }

  const targetCadenceFps = targetQuality === 2 ? 60 : 30
  const shadowsEnabled = targetQuality > 0
  const shadowMapSize = targetQuality === 2 ? 2048 : targetQuality === 1 ? 1024 : 0

  return {
    targetCadenceFps,
    cappedDpr,
    shadowsEnabled,
    shadowMapSize,
    throttleBackground: true,
    qualityLevel: targetQuality,
    claimsUniversal60Fps: false,
  }
}

/**
 * Ring-buffer frame time and renderer telemetry profiler.
 */
export class PerformanceProfiler {
  private frameDeltas: number[] = []
  private maxSamples: number
  private rendererInfoProvider?: () => {
    memory?: { geometries: number; textures: number }
    render?: { calls: number; triangles: number }
  }

  constructor(
    maxSamples = MAX_FRAME_SAMPLES,
    rendererInfoProvider?: () => {
      memory?: { geometries: number; textures: number }
      render?: { calls: number; triangles: number }
    }
  ) {
    this.maxSamples = maxSamples
    this.rendererInfoProvider = rendererInfoProvider
  }

  recordFrame(deltaMs: number): void {
    if (deltaMs <= 0) return
    this.frameDeltas.push(deltaMs)
    if (this.frameDeltas.length > this.maxSamples) {
      this.frameDeltas.shift()
    }
  }

  getMetrics(): PerformanceMetrics {
    if (this.frameDeltas.length === 0) {
      return {
        meanFrameTimeMs: 0,
        p95FrameTimeMs: 0,
        minFrameTimeMs: 0,
        maxFrameTimeMs: 0,
        measuredFps: 0,
        sampleCount: 0,
        geometries: 0,
        textures: 0,
        calls: 0,
        triangles: 0,
        claimsUniversal60Fps: false,
      }
    }

    const count = this.frameDeltas.length
    const sorted = [...this.frameDeltas].sort((a, b) => a - b)
    const sum = sorted.reduce((acc, v) => acc + v, 0)
    const mean = sum / count
    const min = sorted[0]
    const max = sorted[count - 1]
    const p95Index = Math.min(count - 1, Math.floor(count * 0.95))
    const p95 = sorted[p95Index]
    const fps = mean > 0 ? 1000 / mean : 0

    let heapUsedMb: number | undefined
    if (typeof performance !== 'undefined' && (performance as any).memory?.usedJSHeapSize) {
      heapUsedMb = Number(((performance as any).memory.usedJSHeapSize / (1024 * 1024)).toFixed(2))
    }

    const info = this.rendererInfoProvider?.()

    return {
      meanFrameTimeMs: Number(mean.toFixed(2)),
      p95FrameTimeMs: Number(p95.toFixed(2)),
      minFrameTimeMs: Number(min.toFixed(2)),
      maxFrameTimeMs: Number(max.toFixed(2)),
      measuredFps: Number(fps.toFixed(2)),
      sampleCount: count,
      heapUsedMb,
      geometries: info?.memory?.geometries ?? 0,
      textures: info?.memory?.textures ?? 0,
      calls: info?.render?.calls ?? 0,
      triangles: info?.render?.triangles ?? 0,
      claimsUniversal60Fps: false,
    }
  }

  reset(): void {
    this.frameDeltas = []
  }
}
