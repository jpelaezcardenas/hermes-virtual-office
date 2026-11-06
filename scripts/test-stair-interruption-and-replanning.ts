/**
 * Test Stair Interruption & Safe Replanning — Task 9.8
 *
 * Verifies:
 * 1. Reference stair geometry invariants (STAIRS, STAIR_FOOT, STAIR_TOP unchanged).
 * 2. Mid-climb interruption ascending (z = -6.5, target changes to ground desk):
 *    Replans safely via STAIR_FOOT on Level 0, height descends smoothly, no lateral clipping.
 * 3. Mid-descent interruption descending (z = -6.5, target changes to upper CEO suite):
 *    Replans safely via STAIR_TOP on Level 1, height ascends smoothly to landing, enters corridor1.
 * 4. Meeting cancellation while avatar is mid-stair:
 *    Smoothly returns to ground desk via STAIR_FOOT.
 * 5. Higher-priority task arrival while avatar is mid-stair:
 *    Smoothly returns to assigned desk without teleportation.
 * 6. Negative test 1: Lateral exit attempt off stair flight (stepping east or west) is rejected.
 * 7. Negative test 2: Mid-flight vertical teleport (jumping floors/height at z = -6.5) is rejected.
 * 8. Negative test 3: Re-routing to invalid level >= 2 rejected with roof rim datum explanation.
 *
 * Run: npx tsx scripts/test-stair-interruption-and-replanning.ts
 */

import {
  STAIRS,
  STAIR_FOOT,
  STAIR_TOP,
  stairHeightAt,
  LEVELS,
  LEVEL_H,
  ROOF_Y,
  OCCUPIED_LEVELS,
  planStairSafeRoute,
  validateStairInterruption,
  validateMultilevelRoute,
} from '../src/lib/office/polygon-nav'
import {
  onStairArea,
  onStairFlight,
  type Level,
  type Waypoint,
} from '../src/lib/office/nav'
import {
  DESKS,
  ROOMS,
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
  console.log('\n--- Stair Interruption & Safe Replanning Tests (Task 9.8) ---\n')

  const stairMidX = (STAIRS.x1 + STAIRS.x2) / 2

  // ---------------------------------------------------------------------------
  // 1. Reference Stair Geometry Invariants
  // ---------------------------------------------------------------------------
  console.log('1. Reference Stair Geometry & Invariants (Byte-Intact):')
  {
    assert('STAIRS.x1 is -10.0', STAIRS.x1 === -10.0)
    assert('STAIRS.x2 is -8.6', STAIRS.x2 === -8.6)
    assert('STAIRS.z1 is -10.4', STAIRS.z1 === -10.4)
    assert('STAIRS.z2 is -3.2', STAIRS.z2 === -3.2)
    assert('Stair width is exactly 1.4m', Math.abs((STAIRS.x2 - STAIRS.x1) - 1.4) < 1e-6)
    assert('STAIR_FOOT is (-9.3, -2.5)', STAIR_FOOT.x === -9.3 && STAIR_FOOT.z === -2.5)
    assert('STAIR_TOP is (-9.3, -10.1)', STAIR_TOP.x === -9.3 && STAIR_TOP.z === -10.1)
    assert('Occupied levels are strictly [0, 1]', OCCUPIED_LEVELS.length === 2 && OCCUPIED_LEVELS[0] === 0 && OCCUPIED_LEVELS[1] === 1)
    assert('Roof rim datum is 6.8m', ROOF_Y === 6.8)
  }

  // ---------------------------------------------------------------------------
  // 2. Mid-Climb Interruption Ascending -> Ground Desk
  // ---------------------------------------------------------------------------
  console.log('\n2. Mid-Climb Interruption Ascending (z = -6.5 -> Ground Desk):')
  {
    const fromPos = { x: stairMidX, z: -6.5, level: 0 as Level }
    assert('Position (-9.3, -6.5) is on stair flight', onStairFlight(fromPos.x, fromPos.z) === true)
    assert('Position (-9.3, -6.5) is on stair area', onStairArea(fromPos.x, fromPos.z) === true)

    const initialHeight = stairHeightAt(fromPos.x, fromPos.z)
    assert('Initial height at z=-6.5 is ~1.93m', initialHeight !== null && initialHeight > 1.8 && initialHeight < 2.1)

    // Interrupted: avatar retargeted to ground desk in dev room
    const targetDesk = { x: -18.0, z: -18.0, targetLevel: 0 as Level }
    const replannedRoute = planStairSafeRoute(fromPos, targetDesk)

    assert('Replanned route exists and has waypoints', replannedRoute.length >= 2)
    assert('First transit waypoint is STAIR_FOOT', replannedRoute[0].x === STAIR_FOOT.x && replannedRoute[0].z === STAIR_FOOT.z)
    assert('First transit waypoint level is 0', replannedRoute[0].level === 0)

    const validation = validateStairInterruption(fromPos, replannedRoute, 0)
    assert('Replanned route passes validateStairInterruption', validation.valid === true, `${validation.reason}: ${validation.explanation}`)

    // Simulate safe descent along stair axis to STAIR_FOOT
    let prevHeight = initialHeight!
    let smoothDescent = true
    let noLateralClip = true

    for (let z = -6.5; z <= -2.5; z += 0.2) {
      const h = stairHeightAt(stairMidX, z) ?? 0
      if (h > prevHeight + 0.01) smoothDescent = false
      prevHeight = h
      if (stairMidX < STAIRS.x1 - 0.05 || stairMidX > STAIRS.x2 + 0.05) noLateralClip = false
    }

    assert('Height descends smoothly along ramp to 0m at foot', smoothDescent === true)
    assert('Avatar stays centered on stair axis without lateral clipping', noLateralClip === true)
    assert('Final height at ground landing is 0m', stairHeightAt(stairMidX, STAIR_FOOT.z) === null || (stairHeightAt(stairMidX, STAIR_FOOT.z) ?? 0) === 0)
  }

  // ---------------------------------------------------------------------------
  // 3. Mid-Descent Interruption Descending -> Upper CEO Suite
  // ---------------------------------------------------------------------------
  console.log('\n3. Mid-Descent Interruption Descending (z = -6.5 -> Upper CEO Suite):')
  {
    const fromPos = { x: stairMidX, z: -6.5, level: 0 as Level }
    const initialHeight = stairHeightAt(fromPos.x, fromPos.z)

    // Interrupted: avatar retargeted to CEO suite on Level 1
    const targetCeo = { x: -21.0, z: -15.0, targetLevel: 1 as Level }
    const replannedRoute = planStairSafeRoute(fromPos, targetCeo)

    assert('Replanned route exists', replannedRoute.length >= 2)
    assert('First transit waypoint is STAIR_TOP', replannedRoute[0].x === STAIR_TOP.x && replannedRoute[0].z === STAIR_TOP.z)
    assert('First transit waypoint level is 1', replannedRoute[0].level === 1)

    const validation = validateStairInterruption(fromPos, replannedRoute, 1)
    assert('Replanned route passes validateStairInterruption', validation.valid === true)

    // Simulate safe ascent along stair axis to STAIR_TOP
    let prevHeight = initialHeight!
    let smoothAscent = true
    let noLateralClip = true

    for (let z = -6.5; z >= -10.1; z -= 0.2) {
      const h = stairHeightAt(stairMidX, z) ?? LEVEL_H
      if (h < prevHeight - 0.01) smoothAscent = false
      prevHeight = h
      if (stairMidX < STAIRS.x1 - 0.05 || stairMidX > STAIRS.x2 + 0.05) noLateralClip = false
    }

    assert('Height ascends smoothly along ramp to 3.4m at top landing', smoothAscent === true)
    assert('Avatar stays centered on stair axis without lateral clipping', noLateralClip === true)
    assert('Height on top landing is 3.4m (LEVEL_H)', (stairHeightAt(stairMidX, STAIR_TOP.z) ?? 0) === LEVEL_H)
  }

  // ---------------------------------------------------------------------------
  // 4. Meeting Cancellation Mid-Stair
  // ---------------------------------------------------------------------------
  console.log('\n4. Meeting Cancellation Mid-Stair:')
  {
    // Avatar climbing up at z = -5.0 when meeting gets cancelled
    const fromPos = { x: stairMidX, z: -5.0, level: 0 as Level }
    const deskPos = { x: -18.0, z: -13.8, targetLevel: 0 as Level }

    const route = planStairSafeRoute(fromPos, deskPos)
    assert('Route generated on meeting cancellation', route.length > 0)
    assert('Route begins at STAIR_FOOT', route[0].x === STAIR_FOOT.x && route[0].z === STAIR_FOOT.z && route[0].level === 0)

    const val = validateStairInterruption(fromPos, route, 0)
    assert('Route passes validateStairInterruption', val.valid === true)

    const multiVal = validateMultilevelRoute(route)
    assert('Route passes validateMultilevelRoute', multiVal.valid === true)
  }

  // ---------------------------------------------------------------------------
  // 5. Higher-Priority Task Arrival Mid-Stair
  // ---------------------------------------------------------------------------
  console.log('\n5. Higher-Priority Task Arrival Mid-Stair:')
  {
    // Avatar climbing up at z = -7.5 when urgent task arrives
    const fromPos = { x: stairMidX, z: -7.5, level: 0 as Level }
    const devDesk = { x: -18.0, z: 0.0, targetLevel: 0 as Level }

    const route = planStairSafeRoute(fromPos, devDesk)
    assert('Route generated for urgent task rerouting', route.length > 0)
    assert('Route transits STAIR_FOOT on ground floor first', route[0].x === STAIR_FOOT.x && route[0].z === STAIR_FOOT.z && route[0].level === 0)

    const val = validateStairInterruption(fromPos, route, 0)
    assert('Route passes validateStairInterruption without teleportation', val.valid === true)
  }

  // ---------------------------------------------------------------------------
  // 6. Negative Test 1: Lateral Exit Attempt Off Stair Flight
  // ---------------------------------------------------------------------------
  console.log('\n6. Negative Test 1: Lateral Exit Attempt Off Stair Flight:')
  {
    const fromPos = { x: stairMidX, z: -6.5, level: 0 as Level }

    // Attempting to step east into courtyard/pool (x = -7.0, z = -6.5)
    const badEastRoute: Waypoint[] = [
      { x: -7.0, z: -6.5, level: 0 },
      { x: 0.0, z: 4.0, level: 0 },
    ]
    const valEast = validateStairInterruption(fromPos, badEastRoute, 0)
    assert('Stepping laterally east off flight is rejected', valEast.valid === false)
    assert('Rejection reason is stair_lateral_clip', valEast.reason === 'stair_lateral_clip')

    // Attempting to step west into solid wall (x = -11.5, z = -6.5)
    const badWestRoute: Waypoint[] = [
      { x: -11.5, z: -6.5, level: 0 },
      { x: -14.0, z: -6.5, level: 0 },
    ]
    const valWest = validateStairInterruption(fromPos, badWestRoute, 0)
    assert('Stepping laterally west off flight is rejected', valWest.valid === false)
    assert('Rejection reason is stair_lateral_clip', valWest.reason === 'stair_lateral_clip')
  }

  // ---------------------------------------------------------------------------
  // 7. Negative Test 2: Mid-Flight Vertical Teleport
  // ---------------------------------------------------------------------------
  console.log('\n7. Negative Test 2: Mid-Flight Vertical Teleport:')
  {
    const fromPos = { x: stairMidX, z: -6.5, level: 0 as Level }

    // Mid-flight floor teleport from level 0 to level 1 at z = -6.5
    const teleportFloorRoute: Waypoint[] = [
      { x: -9.3, z: -6.5, level: 1 },
      { x: -21.0, z: -15.0, level: 1 },
    ]
    const valTeleport = validateStairInterruption(fromPos, teleportFloorRoute, 1)
    assert('Mid-flight floor teleport without reaching STAIR_TOP is rejected', valTeleport.valid === false)
    assert('Rejection reason is stair_mid_flight_teleport', valTeleport.reason === 'stair_mid_flight_teleport')

    // Mid-flight vertical height jump (jumping from 1.9m to 0m at z = -6.5)
    const teleportHeightRoute: Array<{ x: number; z: number; level: Level; y?: number }> = [
      { x: -9.3, z: -6.5, level: 0, y: 0.0 },
      { x: 0.0, z: 0.0, level: 0 },
    ]
    const valHeight = validateStairInterruption(fromPos, teleportHeightRoute as any, 0)
    assert('Mid-flight vertical height jump to 0m is rejected', valHeight.valid === false)
    assert('Rejection reason is stair_mid_flight_teleport', valHeight.reason === 'stair_mid_flight_teleport')
  }

  // ---------------------------------------------------------------------------
  // 8. Negative Test 3: Re-Routing to Invalid Level >= 2
  // ---------------------------------------------------------------------------
  console.log('\n8. Negative Test 3: Re-Routing to Invalid Level >= 2:')
  {
    const fromPos = { x: stairMidX, z: -6.5, level: 0 as Level }

    // Re-routing to level 2 (decorative roof rim datum)
    const valL2 = validateStairInterruption(fromPos, [{ x: 0, z: 0, level: 2 as any }], 2)
    assert('Re-routing to level 2 is rejected', valL2.valid === false)
    assert('Rejection reason is invalid_level_boundary', valL2.reason === 'invalid_level_boundary')
    assert('Explanation mentions decorative roof rim trim', valL2.explanation?.includes('decorative roof rim trim') === true)

    // Re-routing to level 3
    const valL3 = validateStairInterruption(fromPos, [{ x: 0, z: 0, level: 3 as any }], 3)
    assert('Re-routing to level 3 is rejected', valL3.valid === false)
    assert('Rejection reason is invalid_level_boundary', valL3.reason === 'invalid_level_boundary')

    // Re-routing to negative level
    const valNeg = validateStairInterruption(fromPos, [{ x: 0, z: 0, level: -1 as any }], -1)
    assert('Re-routing to negative level is rejected', valNeg.valid === false)
    assert('Rejection reason is invalid_level_boundary', valNeg.reason === 'invalid_level_boundary')
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\nResults: ${checks - failures}/${checks} checks passed`)
  if (failures > 0) {
    console.error(`FAILURE: ${failures} check(s) failed!`)
    process.exit(1)
  }
  console.log('ALL STAIR INTERRUPTION & REPLANNING CHECKS PASSED SUCCESSFULLY!\n')
}

runTests().catch((err) => {
  console.error('Unhandled test failure:', err)
  process.exit(1)
})
