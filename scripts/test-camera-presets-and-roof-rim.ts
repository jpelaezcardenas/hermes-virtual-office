/**
 * Test Camera Presets, Calibration, Two Occupied Levels & Decorative Roof Rim — Task 9.6
 *
 * Verifies:
 * 1. Four named camera presets (overall, courtyard, lounge, upper-floor) exist with calibrated
 *    position, target, fov, zoom, and exact SHA-256 hashes matching visual-reference.md.
 * 2. Two occupied levels invariant (LEVELS = 2, LEVEL_H = 3.4, OCCUPIED_LEVELS = [0, 1]).
 * 3. 6.8m datum is strictly a decorative roof rim trim; requests for level >= 2, terrace, or tower are rejected.
 * 4. External courtyard stair geometry (STAIRS, STAIR_FOOT, STAIR_TOP, stairHeightAt) connects Level 0 to Level 1.
 * 5. CameraManager updates projection matrices on viewport resize without losing target or calibration parameters.
 *
 * Run: npx tsx scripts/test-camera-presets-and-roof-rim.ts
 */

import {
  LEVELS,
  LEVEL_H,
  ROOF_Y,
  OCCUPIED_LEVELS,
  CAMERA_PRESETS,
  OFFICIAL_REFERENCE_HASHES,
  OFFICIAL_DESKTOP_VIEWPORT,
  OFFICIAL_MOBILE_VIEWPORT,
  getCameraPreset,
  listCameraPresets,
  isOccupiedLevel,
  validateFloorLevel,
  CameraManager,
  type CameraPresetId,
  type CameraLike,
  type OrbitControlsLike,
} from '../src/lib/office/camera'
import {
  STAIRS,
  STAIR_FOOT,
  STAIR_TOP,
  stairHeightAt,
  LEVEL_BOUNDS,
} from '../src/lib/office/layout'

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
  console.log('\n--- Camera Presets, Calibration & Roof Rim Tests (Task 9.6) ---\n')

  // ---------------------------------------------------------------------------
  // 1. Official Reference SHA-256 Hashes Matching visual-reference.md
  // ---------------------------------------------------------------------------
  console.log('1. Official Reference SHA-256 Hashes:')
  {
    const expectedHashes: Record<string, string> = {
      'office-3d.jpg': '5993BCDD3556A93061A3EBEEB6146523E86C56203C9BA435020370B549C8A304',
      'office-courtyard.jpg': '3C2D197A187C551BF126E6B5BFD52C2094E531C58FD79E337159575BD2F67252',
      'office-lounge.jpg': 'AA7C91A1E7D6F0FE80B36E5ABA78F3D9B273477DA1AD28103ED849F267AF3A91',
      'office-upper-floor.jpg': '6D768BB636246E2C6AD5BFDA07B37D0F48A554B26F190D1B349A5ED1C31D6324',
    }

    for (const [img, sha] of Object.entries(expectedHashes)) {
      assert(`Hash for ${img} matches visual-reference.md`, OFFICIAL_REFERENCE_HASHES[img] === sha)
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Four Named Camera Presets with Calibrated Parameters
  // ---------------------------------------------------------------------------
  console.log('\n2. Calibrated Camera Presets:')
  {
    const presets = listCameraPresets()
    assert('listCameraPresets returns exactly 4 presets', presets.length === 4)

    // Overall
    const overall = getCameraPreset('overall')
    assert('overall preset exists', overall.id === 'overall')
    assert('overall position is {14, 34, 40}', overall.position.x === 14 && overall.position.y === 34 && overall.position.z === 40)
    assert('overall target is {0, 1.5, -2}', overall.target.x === 0 && overall.target.y === 1.5 && overall.target.z === -2)
    assert('overall fov is 45', overall.fov === 45)
    assert('overall zoom is 1.0', overall.zoom === 1.0)
    assert('overall reference image is office-3d.jpg', overall.referenceImage === 'office-3d.jpg')
    assert('overall reference sha matches', overall.referenceSha256 === OFFICIAL_REFERENCE_HASHES['office-3d.jpg'])

    // Courtyard
    const courtyard = getCameraPreset('courtyard')
    assert('courtyard preset exists', courtyard.id === 'courtyard')
    assert('courtyard position is {0, 8, 15}', courtyard.position.x === 0 && courtyard.position.y === 8 && courtyard.position.z === 15)
    assert('courtyard target is {0, 2.5, -4}', courtyard.target.x === 0 && courtyard.target.y === 2.5 && courtyard.target.z === -4)
    assert('courtyard fov is 50', courtyard.fov === 50)
    assert('courtyard zoom is 1.0', courtyard.zoom === 1.0)
    assert('courtyard reference image is office-courtyard.jpg', courtyard.referenceImage === 'office-courtyard.jpg')
    assert('courtyard reference sha matches', courtyard.referenceSha256 === OFFICIAL_REFERENCE_HASHES['office-courtyard.jpg'])

    // Lounge
    const lounge = getCameraPreset('lounge')
    assert('lounge preset exists', lounge.id === 'lounge')
    assert('lounge position is {20, 7, 12}', lounge.position.x === 20 && lounge.position.y === 7 && lounge.position.z === 12)
    assert('lounge target is {2, 2.5, -4}', lounge.target.x === 2 && lounge.target.y === 2.5 && lounge.target.z === -4)
    assert('lounge fov is 55', lounge.fov === 55)
    assert('lounge zoom is 1.0', lounge.zoom === 1.0)
    assert('lounge reference image is office-lounge.jpg', lounge.referenceImage === 'office-lounge.jpg')
    assert('lounge reference sha matches', lounge.referenceSha256 === OFFICIAL_REFERENCE_HASHES['office-lounge.jpg'])

    // Upper floor
    const upper = getCameraPreset('upper-floor')
    assert('upper-floor preset exists', upper.id === 'upper-floor')
    assert('upper-floor position is {-12, 6.2, -6}', upper.position.x === -12 && upper.position.y === 6.2 && upper.position.z === -6)
    assert('upper-floor target is {-20, 4.5, -16}', upper.target.x === -20 && upper.target.y === 4.5 && upper.target.z === -16)
    assert('upper-floor fov is 45', upper.fov === 45)
    assert('upper-floor zoom is 1.0', upper.zoom === 1.0)
    assert('upper-floor reference image is office-upper-floor.jpg', upper.referenceImage === 'office-upper-floor.jpg')
    assert('upper-floor reference sha matches', upper.referenceSha256 === OFFICIAL_REFERENCE_HASHES['office-upper-floor.jpg'])
  }

  // ---------------------------------------------------------------------------
  // 3. Two Occupied Levels & Decorative Roof Rim Invariants
  // ---------------------------------------------------------------------------
  console.log('\n3. Two Occupied Levels & Decorative Roof Rim:')
  {
    assert('LEVELS is 2', LEVELS === 2)
    assert('LEVEL_H is 3.4', LEVEL_H === 3.4)
    assert('ROOF_Y is 6.8', ROOF_Y === 6.8)
    assert('OCCUPIED_LEVELS contains strictly [0, 1]', OCCUPIED_LEVELS.length === 2 && OCCUPIED_LEVELS[0] === 0 && OCCUPIED_LEVELS[1] === 1)

    assert('isOccupiedLevel(0) is true', isOccupiedLevel(0) === true)
    assert('isOccupiedLevel(1) is true', isOccupiedLevel(1) === true)
    assert('isOccupiedLevel(2) is false (roof rim datum)', isOccupiedLevel(2) === false)
    assert('isOccupiedLevel(3) is false', isOccupiedLevel(3) === false)
    assert('isOccupiedLevel(-1) is false', isOccupiedLevel(-1) === false)

    // validateFloorLevel
    const v0 = validateFloorLevel(0)
    assert('validateFloorLevel(0) is valid', v0.valid === true)

    const v1 = validateFloorLevel(1)
    assert('validateFloorLevel(1) is valid', v1.valid === true)

    const v2 = validateFloorLevel(2)
    assert('validateFloorLevel(2) is rejected', v2.valid === false)
    assert('validateFloorLevel(2) explains 6.8m decorative roof rim', (v2.error ?? '').includes('6.8m') && (v2.error ?? '').includes('decorative'))

    const v3 = validateFloorLevel(3)
    assert('validateFloorLevel(3) is rejected', v3.valid === false)
    assert('validateFloorLevel(3) notes no terrace or tower', (v3.error ?? '').includes('terrace or tower'))

    const vn = validateFloorLevel(-1)
    assert('validateFloorLevel(-1) is rejected', vn.valid === false)
  }

  // ---------------------------------------------------------------------------
  // 4. External Stair Geometry Connecting Level 0 to Level 1
  // ---------------------------------------------------------------------------
  console.log('\n4. External Courtyard Stair Geometry:')
  {
    assert('STAIRS fromLevel is 0', STAIRS.fromLevel === 0)
    assert('STAIRS toLevel is 1', STAIRS.toLevel === 1)
    assert('STAIRS x1 is -10.0', STAIRS.x1 === -10.0)
    assert('STAIRS x2 is -8.6', STAIRS.x2 === -8.6)
    assert('STAIRS z1 is -10.4', STAIRS.z1 === -10.4)
    assert('STAIRS z2 is -3.2', STAIRS.z2 === -3.2)

    const stairMidX = (STAIRS.x1 + STAIRS.x2) / 2
    assert('STAIR_FOOT x is centered on stair', Math.abs(STAIR_FOOT.x - stairMidX) < 0.001)
    assert('STAIR_FOOT z is clear of bottom riser (z -2.5)', STAIR_FOOT.z > STAIRS.z2)

    assert('STAIR_TOP x is centered on stair', Math.abs(STAIR_TOP.x - stairMidX) < 0.001)
    assert('STAIR_TOP z is on the landing (z -10.1)', STAIR_TOP.z < -9.47)

    // Height ramp checks
    const hBottom = stairHeightAt(stairMidX, STAIRS.z2)
    assert('stairHeightAt bottom is 0m', hBottom !== null && Math.abs(hBottom) < 0.001)

    const hTop = stairHeightAt(stairMidX, STAIRS.z1)
    assert('stairHeightAt top is LEVEL_H (3.4m)', hTop !== null && Math.abs(hTop - LEVEL_H) < 0.001)

    const hMid = stairHeightAt(stairMidX, (STAIRS.z1 + STAIRS.z2) / 2)
    assert('stairHeightAt mid-flight is between 0 and 3.4m', hMid !== null && hMid > 0 && hMid < LEVEL_H)

    const hOutside = stairHeightAt(0, 0)
    assert('stairHeightAt outside stair returns null', hOutside === null)
  }

  // ---------------------------------------------------------------------------
  // 5. CameraManager Viewport Resizing & Calibration Preservation
  // ---------------------------------------------------------------------------
  console.log('\n5. CameraManager Viewport Resizing & Calibration:')
  {
    // Mock PerspectiveCamera
    const mockCamera: CameraLike = {
      position: {
        x: 0,
        y: 0,
        z: 0,
        set(x: number, y: number, z: number) {
          this.x = x
          this.y = y
          this.z = z
        },
      },
      fov: 45,
      zoom: 1.0,
      aspect: 1.0,
      updateProjectionMatrix: () => {},
    }

    // Mock OrbitControls
    const mockControls: OrbitControlsLike = {
      target: {
        x: 0,
        y: 0,
        z: 0,
        set(x: number, y: number, z: number) {
          this.x = x
          this.y = y
          this.z = z
        },
      },
      minDistance: 1,
      maxDistance: 100,
      update: () => {},
    }

    const mgr = new CameraManager(mockCamera, mockControls, 'overall')
    assert('Initial active preset is overall', mgr.getActivePresetId() === 'overall')
    assert('Camera position initialized to overall {14, 34, 40}', mockCamera.position.x === 14 && mockCamera.position.y === 34 && mockCamera.position.z === 40)
    assert('Controls target initialized to overall {0, 1.5, -2}', mockControls.target.x === 0 && mockControls.target.y === 1.5 && mockControls.target.z === -2)
    assert('Camera fov is 45', mockCamera.fov === 45)

    // Switch to courtyard
    mgr.applyPreset('courtyard', false)
    assert('Active preset switched to courtyard', mgr.getActivePresetId() === 'courtyard')
    assert('Camera position updated to courtyard {0, 8, 15}', mockCamera.position.x === 0 && mockCamera.position.y === 8 && mockCamera.position.z === 15)
    assert('Controls target updated to courtyard {0, 2.5, -4}', mockControls.target.x === 0 && mockControls.target.y === 2.5 && mockControls.target.z === -4)
    assert('Camera fov updated to 50', mockCamera.fov === 50)

    // Viewport resize (desktop standard 2000x1000)
    mgr.handleResize(2000, 1000)
    assert('Camera aspect is 2.0 after 2000x1000 resize', mockCamera.aspect === 2.0)
    assert('Camera fov preserved at 50 for courtyard preset', mockCamera.fov === 50)
    assert('Camera zoom preserved at 1.0', mockCamera.zoom === 1.0)
    assert('Target preserved at {0, 2.5, -4}', mockControls.target.x === 0 && mockControls.target.y === 2.5 && mockControls.target.z === -4)

    // Viewport resize (mobile portrait 390x844)
    mgr.handleResize(390, 844)
    assert('Camera aspect updated for mobile (390/844)', Math.abs(mockCamera.aspect - 390 / 844) < 0.001)
    assert('Camera fov preserved at 50 for mobile viewport', mockCamera.fov === 50)
    assert('Target preserved for mobile viewport', mockControls.target.x === 0 && mockControls.target.y === 2.5 && mockControls.target.z === -4)

    // Switch to upper-floor
    mgr.applyPreset('upper-floor', false)
    assert('Active preset switched to upper-floor', mgr.getActivePresetId() === 'upper-floor')
    assert('Camera position updated to upper-floor {-12, 6.2, -6}', mockCamera.position.x === -12 && mockCamera.position.y === 6.2 && mockCamera.position.z === -6)
    assert('Controls target updated to upper-floor {-20, 4.5, -16}', mockControls.target.x === -20 && mockControls.target.y === 4.5 && mockControls.target.z === -16)
    assert('Camera fov updated to 45', mockCamera.fov === 45)

    // Resize while upper-floor is active
    mgr.handleResize(1440, 900)
    assert('Camera aspect updated to 1.6', Math.abs(mockCamera.aspect - 1440 / 900) < 0.001)
    assert('Camera fov preserved at 45 for upper-floor preset', mockCamera.fov === 45)
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\nResults: ${checks} checks passed, ${failures} failures.\n`)
  if (failures > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Unhandled error during camera tests:', err)
  process.exit(1)
})
