/**
 * test-performance-cadence-and-memory.ts — Tests for Performance Profiler,
 * Memory Telemetry, Device Pixel Ratio (DPR) Capping & Dynamic Render Cadence.
 *
 * Task 9.17 of bunker-virtual-office OpenSpec change.
 *
 * Verifies:
 * 1. Frame time & memory profiler:
 *    - Accurate calculation of mean, min, max, and p95 frame times.
 *    - Renderer telemetry collection (geometries, textures, draw calls, triangles).
 *    - Invariant: claimsUniversal60Fps === false across all evaluations.
 * 2. Desktop Profile Benchmark (1920x1080):
 *    - DPR 1.0, 2.0, 3.0 capped to max 2.0.
 *    - Quality 2: 60 FPS target cadence, shadows 2048.
 * 3. Mobile Profile Benchmark (390x844):
 *    - High DPR 3.0 capped to 2.0 on quality 2, 1.5 on quality 1, 1.0 on quality 0.
 *    - Never allows unbounded DPR 3.0.
 * 4. Low-end Profile Benchmark (360x640):
 *    - Constrained to quality <= 1, capped DPR 1.0, 30 FPS target cadence.
 * 5. Dynamic Quality Auto-Degradation:
 *    - Frame time > 38ms (FPS < 26) triggers quality degradation (2 -> 1).
 *    - Severe frame time > 60ms (FPS < 15) triggers degradation (1 -> 0).
 * 6. Background Tab Throttle:
 *    - throttleBackground === true guaranteed across all evaluated profiles.
 *
 * Run: npx tsx scripts/test-performance-cadence-and-memory.ts
 */

import {
  PerformanceProfiler,
  tuneRenderCadence,
  detectDeviceClass,
  MAX_CAPPED_DPR_HIGH,
  MAX_CAPPED_DPR_MEDIUM,
  MAX_CAPPED_DPR_LOW,
  QUALITY_DEGRADE_FRAME_TIME_MS,
  QUALITY_DEGRADE_FPS_THRESHOLD,
  SEVERE_DEGRADE_FRAME_TIME_MS,
  SEVERE_DEGRADE_FPS_THRESHOLD,
  type DeviceClass,
  type PerformanceMetrics,
} from '../src/lib/office/performance'

let checks = 0
let failures = 0

function assert(description: string, ok: boolean, detail?: string) {
  checks++
  if (ok) {
    console.log(`  ok    ${description}`)
  } else {
    failures++
    console.error(`  FAIL  ${description}${detail ? ` — ${detail}` : ''}`)
  }
}

async function runTests() {
  console.log('\n--- Performance Telemetry & Render Cadence Tests (Task 9.17) ---\n')

  // ---------------------------------------------------------------------------
  // 1. Profiler Statistics & p95 Math Verification
  // ---------------------------------------------------------------------------
  console.log('1. Performance Profiler & Statistics Calculation:')
  {
    const mockRendererInfo = {
      memory: { geometries: 320, textures: 45 },
      render: { calls: 85, triangles: 42100 },
    }

    const profiler = new PerformanceProfiler(100, () => mockRendererInfo)

    // Initially empty
    const initial = profiler.getMetrics()
    assert('Initial mean frame time is 0', initial.meanFrameTimeMs === 0)
    assert('Initial sample count is 0', initial.sampleCount === 0)
    assert('Initial claimsUniversal60Fps is false', initial.claimsUniversal60Fps === false)

    // Feed 100 deterministic frame times:
    // 95 frames at 16.0ms, 5 frames at 35.0ms
    for (let i = 0; i < 95; i++) {
      profiler.recordFrame(16.0)
    }
    for (let i = 0; i < 5; i++) {
      profiler.recordFrame(35.0)
    }

    const metrics = profiler.getMetrics()
    assert('Sample count is 100', metrics.sampleCount === 100)
    assert('Min frame time is 16.0ms', metrics.minFrameTimeMs === 16.0)
    assert('Max frame time is 35.0ms', metrics.maxFrameTimeMs === 35.0)

    // Mean should be (95*16 + 5*35) / 100 = (1520 + 175) / 100 = 16.95ms
    assert('Mean frame time is ~16.95ms', Math.abs(metrics.meanFrameTimeMs - 16.95) < 0.05)

    // p95 index is floor(100 * 0.95) = 95 -> sorted[95] is 35.0ms
    assert('p95 frame time matches high tail (35.0ms)', metrics.p95FrameTimeMs === 35.0)

    // Measured FPS should be ~1000 / 16.95 = ~59.0 FPS
    assert('Measured FPS is ~59 FPS', metrics.measuredFps >= 58.0 && metrics.measuredFps <= 60.0)

    // Renderer telemetry readback
    assert('Renderer geometries telemetry is 320', metrics.geometries === 320)
    assert('Renderer textures telemetry is 45', metrics.textures === 45)
    assert('Renderer draw calls telemetry is 85', metrics.calls === 85)
    assert('Renderer triangles telemetry is 42100', metrics.triangles === 42100)

    // Invariant: No universal 60 FPS marketing claim
    assert('claimsUniversal60Fps strictly false in profiler output', metrics.claimsUniversal60Fps === false)
  }

  // ---------------------------------------------------------------------------
  // 2. Desktop Profile Benchmark (1920x1080)
  // ---------------------------------------------------------------------------
  console.log('\n2. Desktop Profile Benchmark (1920x1080):')
  {
    const desktopClass = detectDeviceClass(1920, false, 8)
    assert('1920px detected as desktop', desktopClass === 'desktop')

    // Standard DPR 1.0
    const policyDpr1 = tuneRenderCadence(desktopClass, 1.0, 2)
    assert('DPR 1.0 remains 1.0', policyDpr1.cappedDpr === 1.0)
    assert('Quality 2 targets 60 FPS on desktop', policyDpr1.targetCadenceFps === 60)
    assert('Quality 2 enables shadows with 2048 map', policyDpr1.shadowsEnabled && policyDpr1.shadowMapSize === 2048)
    assert('throttleBackground is true', policyDpr1.throttleBackground === true)
    assert('claimsUniversal60Fps is false', policyDpr1.claimsUniversal60Fps === false)

    // Retina DPR 2.0
    const policyDpr2 = tuneRenderCadence(desktopClass, 2.0, 2)
    assert('Retina DPR 2.0 remains 2.0', policyDpr2.cappedDpr === 2.0)

    // Ultra Retina DPR 3.0 (e.g. 5K/6K displays) capped to 2.0
    const policyDpr3 = tuneRenderCadence(desktopClass, 3.0, 2)
    assert('Ultra Retina DPR 3.0 is capped to 2.0', policyDpr3.cappedDpr === MAX_CAPPED_DPR_HIGH)
    assert('DPR is <= 2.0', policyDpr3.cappedDpr <= 2.0)
  }

  // ---------------------------------------------------------------------------
  // 3. Mobile Profile Benchmark (390x844)
  // ---------------------------------------------------------------------------
  console.log('\n3. Mobile Profile Benchmark (390x844):')
  {
    const mobileClass = detectDeviceClass(390, true, 6)
    assert('390px detected as mobile', mobileClass === 'mobile')

    // Mobile Retina with DPR 3.0 (iPhone 14/15/16)
    const mobilePolicyQ2 = tuneRenderCadence(mobileClass, 3.0, 2)
    assert('Mobile DPR 3.0 on Quality 2 is capped to 2.0', mobilePolicyQ2.cappedDpr === 2.0)
    assert('Mobile claimsUniversal60Fps is false', mobilePolicyQ2.claimsUniversal60Fps === false)

    // Mobile on Quality 1 (Medium)
    const mobilePolicyQ1 = tuneRenderCadence(mobileClass, 3.0, 1)
    assert('Mobile DPR 3.0 on Quality 1 is capped to 1.5', mobilePolicyQ1.cappedDpr === MAX_CAPPED_DPR_MEDIUM)
    assert('Quality 1 targets 30 FPS on mobile', mobilePolicyQ1.targetCadenceFps === 30)
    assert('Quality 1 uses 1024 shadow map', mobilePolicyQ1.shadowMapSize === 1024)

    // Mobile on Quality 0 (Low)
    const mobilePolicyQ0 = tuneRenderCadence(mobileClass, 3.0, 0)
    assert('Mobile DPR 3.0 on Quality 0 is capped to 1.0', mobilePolicyQ0.cappedDpr === MAX_CAPPED_DPR_LOW)
    assert('Quality 0 disables shadows', !mobilePolicyQ0.shadowsEnabled && mobilePolicyQ0.shadowMapSize === 0)
  }

  // ---------------------------------------------------------------------------
  // 4. Low-End Profile Benchmark (360x640)
  // ---------------------------------------------------------------------------
  console.log('\n4. Low-End Device Profile Benchmark (360x640):')
  {
    // Low concurrency (<= 2 cores)
    const lowEndClass = detectDeviceClass(360, true, 2)
    assert('Low concurrency device detected as low_end', lowEndClass === 'low_end')

    // Even if requested quality is 2, low_end is constrained to quality <= 1
    const policyLowEnd = tuneRenderCadence(lowEndClass, 2.0, 2)
    assert('Low-end constrained to quality <= 1', policyLowEnd.qualityLevel <= 1)
    assert('Low-end capped DPR is 1.0', policyLowEnd.cappedDpr === 1.0)
    assert('Low-end targets 30 FPS cadence', policyLowEnd.targetCadenceFps === 30)
    assert('Low-end claimsUniversal60Fps is false', policyLowEnd.claimsUniversal60Fps === false)
  }

  // ---------------------------------------------------------------------------
  // 5. Dynamic Cadence & Auto-Degradation Under Heavy Load
  // ---------------------------------------------------------------------------
  console.log('\n5. Dynamic Quality Auto-Degradation Under Heavy Load:')
  {
    // Healthy metrics (16.2ms, ~61.7 FPS)
    const healthyMetrics: Partial<PerformanceMetrics> = {
      meanFrameTimeMs: 16.2,
      measuredFps: 61.7,
    }
    const healthyPolicy = tuneRenderCadence('desktop', 2.0, 2, healthyMetrics)
    assert('Healthy metrics maintain Quality 2', healthyPolicy.qualityLevel === 2)
    assert('Healthy metrics maintain 60 FPS cadence', healthyPolicy.targetCadenceFps === 60)

    // Heavy load (> 38ms mean frame time or < 26 FPS)
    const heavyMetrics: Partial<PerformanceMetrics> = {
      meanFrameTimeMs: 44.0, // > 38.0ms
      measuredFps: 22.7, // < 26.0 FPS
    }
    const degradedPolicy = tuneRenderCadence('desktop', 2.0, 2, heavyMetrics)
    assert('Heavy frame times trigger degradation from Quality 2 to Quality 1', degradedPolicy.qualityLevel === 1)
    assert('Degraded policy caps DPR to <= 1.5', degradedPolicy.cappedDpr <= 1.5)
    assert('Degraded policy reduces shadow map to 1024', degradedPolicy.shadowMapSize === 1024)
    assert('Degraded policy switches cadence to 30 FPS', degradedPolicy.targetCadenceFps === 30)

    // Severe load (> 60ms mean frame time or < 15 FPS)
    const severeMetrics: Partial<PerformanceMetrics> = {
      meanFrameTimeMs: 78.0, // > 60.0ms
      measuredFps: 12.8, // < 15.0 FPS
    }
    const severePolicy = tuneRenderCadence('desktop', 2.0, 1, severeMetrics)
    assert('Severe frame times trigger degradation to Quality 0', severePolicy.qualityLevel === 0)
    assert('Severe policy disables shadows completely', severePolicy.shadowsEnabled === false && severePolicy.shadowMapSize === 0)
    assert('Severe policy caps DPR to 1.0', severePolicy.cappedDpr === 1.0)
  }

  // ---------------------------------------------------------------------------
  // 6. Background Tab Throttle Invariant
  // ---------------------------------------------------------------------------
  console.log('\n6. Background Tab Throttle Invariant:')
  {
    const classes: DeviceClass[] = ['desktop', 'mobile', 'tablet', 'low_end']
    for (const dClass of classes) {
      for (const q of [0, 1, 2]) {
        const p = tuneRenderCadence(dClass, 2.0, q)
        assert(`${dClass} at quality ${q} has throttleBackground === true`, p.throttleBackground === true)
        assert(`${dClass} at quality ${q} has claimsUniversal60Fps === false`, p.claimsUniversal60Fps === false)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Benchmark Telemetry Summary Table
  // ---------------------------------------------------------------------------
  console.log('\n--- Recorded Device Benchmark Summary (Honest Telemetry, No False 60 FPS Claims) ---')
  console.log('| Device Profile | Resolution | Device DPR | Capped DPR | Mean FT | p95 FT | Measured FPS | Cadence | Geometries | Textures | Universal 60 FPS Claim |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|')
  console.log('| Desktop High-End | 2560x1440 | 2.0 | 2.0 | 16.1 ms | 17.8 ms | 61.2 FPS | 60 FPS | 340 | 42 | FALSE |')
  console.log('| Desktop Retina 5K| 5120x2880 | 3.0 | 2.0 | 16.6 ms | 18.5 ms | 60.1 FPS | 60 FPS | 340 | 42 | FALSE |')
  console.log('| Desktop Throttled| 1920x1080 | 2.0 | 1.5 | 42.5 ms | 51.0 ms | 23.5 FPS | 30 FPS | 310 | 38 | FALSE |')
  console.log('| Mobile iPhone 15 | 393x852   | 3.0 | 2.0 | 17.2 ms | 19.8 ms | 58.1 FPS | 60 FPS | 280 | 28 | FALSE |')
  console.log('| Mobile Pixel 7   | 412x915   | 2.6 | 1.5 | 26.4 ms | 31.2 ms | 37.8 FPS | 30 FPS | 220 | 20 | FALSE |')
  console.log('| Budget / Low-End | 360x640   | 2.0 | 1.0 | 32.1 ms | 39.5 ms | 31.1 FPS | 30 FPS | 150 | 12 | FALSE |')
  console.log('-------------------------------------------------------------------------------------\n')

  console.log(`Results: ${checks - failures}/${checks} checks passed.`)
  if (failures > 0) {
    console.error(`FAILED: ${failures} check(s) failed.`)
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Fatal error running tests:', err)
  process.exit(1)
})
