/**
 * Test Polygon Path Validity & Multilevel Navigation Mesh — Task 9.7
 *
 * Verifies:
 * 1. Multilevel navmesh grid resolution (CELL = 0.5, BODY_R = 0.34).
 * 2. Same-floor ground routing: desk to desk, desk to lounge, avoids walls and pool.
 * 3. Same-floor upper routing: CEO room to meeting rooms along corridor1 through designated doors.
 * 4. Ground-to-upper routing: ground desk to upper CEO room paths to STAIR_FOOT, climbs to STAIR_TOP, enters corridor.
 * 5. Upper-to-ground routing: upper meeting room to ground lounge descends via stair (STAIR_TOP -> STAIR_FOOT).
 * 6. Negative test 1: Artificially constructed path cutting through north bar wall fails validateMultilevelRoute.
 * 7. Negative test 2: Artificially constructed path teleporting between floors at (0, 0) without stair fails validateMultilevelRoute.
 * 8. Negative test 3: Path targeting level 2 or higher fails with occupied level explanation.
 * 9. Real routeBetween and planRoute outputs pass validateMultilevelRoute.
 *
 * Run: npx tsx scripts/test-polygon-path-and-navmesh.ts
 */

import {
  CELL,
  BODY_R,
  LEVELS,
  LEVEL_H,
  ROOF_Y,
  OCCUPIED_LEVELS,
  STAIR_FOOT,
  STAIR_TOP,
  segmentIntersectsBox,
  segmentIntersectsAABB,
  isSegmentInOpening,
  validatePathSegment,
  segmentIntersectsPool,
  validateMultilevelRoute,
} from '../src/lib/office/polygon-nav'
import {
  route,
  routeBetween,
  planRoute,
  type Waypoint,
  type Level,
} from '../src/lib/office/nav'
import {
  DESKS,
  ROOMS,
  POOL,
  FOOTPRINTS,
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
  console.log('\n--- Polygon Path & Multilevel Navmesh Tests (Task 9.7) ---\n')

  // ---------------------------------------------------------------------------
  // 1. Grid Resolution & Constants
  // ---------------------------------------------------------------------------
  console.log('1. Multilevel Navmesh Grid Resolution & Geometry Invariants:')
  {
    assert('Grid cell resolution is 0.5m', CELL === 0.5)
    assert('Avatar body radius is 0.34m', BODY_R === 0.34)
    assert('Building strictly has 2 levels', LEVELS === 2)
    assert('Floor height is 3.4m', LEVEL_H === 3.4)
    assert('Roof rim datum is 6.8m', ROOF_Y === 6.8)
    assert('Occupied levels are strictly [0, 1]', OCCUPIED_LEVELS.length === 2 && OCCUPIED_LEVELS[0] === 0 && OCCUPIED_LEVELS[1] === 1)
    assert('External courtyard stair foot is (-9.3, -2.5)', STAIR_FOOT.x === -9.3 && STAIR_FOOT.z === -2.5)
    assert('External courtyard stair top is (-9.3, -10.1)', STAIR_TOP.x === -9.3 && STAIR_TOP.z === -10.1)
  }

  // ---------------------------------------------------------------------------
  // 2. Segment-AABB Intersection Math & Doorway Clearance
  // ---------------------------------------------------------------------------
  console.log('\n2. Segment-AABB Intersection & Door Clearance:')
  {
    const box = { x: 0, z: 0, hw: 2, hd: 2 }
    const hitEnter = segmentIntersectsBox(-5, 0, 5, 0, box)
    assert('Segment crossing box returns hit=true', hitEnter.hit === true)
    assert('Segment crossing box t0 is ~0.3', Math.abs(hitEnter.t0 - 0.3) < 0.01)
    assert('Segment crossing box t1 is ~0.7', Math.abs(hitEnter.t1 - 0.7) < 0.01)

    const hitMiss = segmentIntersectsBox(-5, 5, 5, 5, box)
    assert('Segment outside box returns hit=false', hitMiss.hit === false)

    // Segment intersects AABB alias
    const hitAlias = segmentIntersectsAABB(-5, 0, 5, 0, box)
    assert('segmentIntersectsAABB behaves identically to segmentIntersectsBox', hitAlias.hit === true)

    // Doorway opening clearance on level 0 (lobby entrance at x=0, z=21)
    const doorCrossingL0 = isSegmentInOpening(0, 19.5, 0, 21.5, 0)
    assert('Lobby doorway crossing is detected cleanly', doorCrossingL0 === true)

    // Doorway opening clearance on level 1 (CEO door at x=-21, z=-11.5)
    const doorCrossingL1 = isSegmentInOpening(-21, -10.0, -21, -13.0, 1)
    assert('CEO doorway crossing is detected cleanly', doorCrossingL1 === true)
  }

  // ---------------------------------------------------------------------------
  // 3. Same-Floor Ground Routing (Desks to Desks, Desks to Lounge, Avoids Pool)
  // ---------------------------------------------------------------------------
  console.log('\n3. Same-Floor Ground Routing (Wall & Pool Avoidance):')
  {
    // Desk 0 (dev) to Desk 4 (growth/mkt)
    const d0 = DESKS[0]
    const d4 = DESKS[4]
    const rDeskToDesk = route({ x: d0.x, z: d0.z }, { x: d4.x, z: d4.z }, 0)
    assert('Desk-to-desk route exists', rDeskToDesk.length > 0)

    const wpsDeskToDesk: Waypoint[] = rDeskToDesk.map((p) => ({ ...p, level: 0 as Level }))
    const valDeskToDesk = validateMultilevelRoute(wpsDeskToDesk)
    assert('Desk-to-desk route passes validateMultilevelRoute', valDeskToDesk.valid === true)

    // Dev desk to East Wing Lounge
    const loungeRoom = ROOMS.find((r) => r.id === 'leisure')!
    const loungeTarget = { x: (loungeRoom.x1 + loungeRoom.x2) / 2, z: (loungeRoom.z1 + loungeRoom.z2) / 2 }
    const rDeskToLounge = route({ x: d0.x, z: d0.z }, loungeTarget, 0)
    assert('Desk-to-lounge route exists', rDeskToLounge.length > 0)

    const wpsDeskToLounge: Waypoint[] = rDeskToLounge.map((p) => ({ ...p, level: 0 as Level }))
    const valDeskToLounge = validateMultilevelRoute(wpsDeskToLounge)
    assert('Desk-to-lounge route passes validateMultilevelRoute', valDeskToLounge.valid === true)

    // Assert pool avoidance: no waypoint or segment intersects pool box
    let poolCollision = false
    for (let i = 0; i < rDeskToLounge.length - 1; i++) {
      const p1 = rDeskToLounge[i]
      const p2 = rDeskToLounge[i + 1]
      if (segmentIntersectsPool(p1.x, p1.z, p2.x, p2.z, 0.0)) {
        poolCollision = true
        break
      }
    }
    assert('Desk-to-lounge path strictly avoids the swimming pool', !poolCollision)
  }

  // ---------------------------------------------------------------------------
  // 4. Same-Floor Upper Routing (CEO to Meeting Rooms along Corridor 1)
  // ---------------------------------------------------------------------------
  console.log('\n4. Same-Floor Upper Routing (CEO to Meeting Rooms):')
  {
    const ceo = ROOMS.find((r) => r.id === 'ceo')!
    const ceoCenter = { x: (ceo.x1 + ceo.x2) / 2, z: (ceo.z1 + ceo.z2) / 2 }
    const meetingIds = ['rinjani', 'merapi', 'bromo', 'semeru', 'cikurai']

    for (const mId of meetingIds) {
      const rm = ROOMS.find((r) => r.id === mId)!
      const rmCenter = { x: (rm.x1 + rm.x2) / 2, z: (rm.z1 + rm.z2) / 2 }
      const rCeoToMeeting = route(ceoCenter, rmCenter, 1)
      assert(`Route from CEO room to ${mId} exists`, rCeoToMeeting.length > 0)

      const wps: Waypoint[] = rCeoToMeeting.map((p) => ({ ...p, level: 1 as Level }))
      const val = validateMultilevelRoute(wps)
      assert(`Route from CEO room to ${mId} passes validateMultilevelRoute`, val.valid === true)

      // Verify path traverses corridor1 (z between -11.5 and -9.3)
      const traversesCorridor = wps.some((p) => p.z >= -11.5 && p.z <= -9.0)
      assert(`Route to ${mId} traverses glazed corridor1`, traversesCorridor)
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Ground-to-Upper Routing (Desk to CEO via External Stair)
  // ---------------------------------------------------------------------------
  console.log('\n5. Ground-to-Upper Stair Routing:')
  {
    const d0 = DESKS[0]
    const ceo = ROOMS.find((r) => r.id === 'ceo')!
    const ceoCenter = { x: (ceo.x1 + ceo.x2) / 2, z: (ceo.z1 + ceo.z2) / 2 }

    const rUp = routeBetween(
      { x: d0.x, z: d0.z, level: 0 },
      { x: ceoCenter.x, z: ceoCenter.z, level: 1 },
    )
    assert('Ground desk to upper CEO route exists', rUp.length > 0)

    const valUp = validateMultilevelRoute(rUp)
    assert('Ground-to-upper route passes validateMultilevelRoute', valUp.valid === true)

    // Verify it passes STAIR_FOOT on level 0 and STAIR_TOP on level 1
    const passesFoot = rUp.some((p) => p.level === 0 && Math.hypot(p.x - STAIR_FOOT.x, p.z - STAIR_FOOT.z) < 0.1)
    const passesTop = rUp.some((p) => p.level === 1 && Math.hypot(p.x - STAIR_TOP.x, p.z - STAIR_TOP.z) < 0.1)
    assert('Ground-to-upper route arrives at STAIR_FOOT on ground floor', passesFoot)
    assert('Ground-to-upper route climbs to STAIR_TOP on upper floor', passesTop)

    // Verify planRoute matches
    const planUp = planRoute(
      { x: d0.x, z: d0.z, level: 0, targetLevel: 1 },
      ceoCenter,
    )
    assert('planRoute ground-to-upper passes validateMultilevelRoute', validateMultilevelRoute(planUp).valid === true)
  }

  // ---------------------------------------------------------------------------
  // 6. Upper-to-Ground Routing (Meeting Room to Lounge via Stair)
  // ---------------------------------------------------------------------------
  console.log('\n6. Upper-to-Ground Stair Routing:')
  {
    const rinjani = ROOMS.find((r) => r.id === 'rinjani')!
    const rinjaniCenter = { x: (rinjani.x1 + rinjani.x2) / 2, z: (rinjani.z1 + rinjani.z2) / 2 }
    const leisure = ROOMS.find((r) => r.id === 'leisure')!
    const leisureCenter = { x: (leisure.x1 + leisure.x2) / 2, z: (leisure.z1 + leisure.z2) / 2 }

    const rDown = routeBetween(
      { x: rinjaniCenter.x, z: rinjaniCenter.z, level: 1 },
      { x: leisureCenter.x, z: leisureCenter.z, level: 0 },
    )
    assert('Upper meeting room to ground lounge route exists', rDown.length > 0)

    const valDown = validateMultilevelRoute(rDown)
    assert('Upper-to-ground route passes validateMultilevelRoute', valDown.valid === true)

    // Verify descent via STAIR_TOP to STAIR_FOOT
    const reachesTop = rDown.some((p) => p.level === 1 && Math.hypot(p.x - STAIR_TOP.x, p.z - STAIR_TOP.z) < 0.1)
    const reachesFoot = rDown.some((p) => p.level === 0 && Math.hypot(p.x - STAIR_FOOT.x, p.z - STAIR_FOOT.z) < 0.1)
    assert('Upper-to-ground route approaches STAIR_TOP on upper floor', reachesTop)
    assert('Upper-to-ground route descends to STAIR_FOOT on ground floor', reachesFoot)

    // Verify planRoute matches
    const planDown = planRoute(
      { x: rinjaniCenter.x, z: rinjaniCenter.z, level: 1, targetLevel: 0 },
      leisureCenter,
    )
    assert('planRoute upper-to-ground passes validateMultilevelRoute', validateMultilevelRoute(planDown).valid === true)
  }

  // ---------------------------------------------------------------------------
  // 7. Negative Test 1: Artificially Constructed Path Cutting Wall Fails
  // ---------------------------------------------------------------------------
  console.log('\n7. Negative Test 1: Wall-Cutting Path Fails:')
  {
    // Segment cutting through solid outer north wall at z = -21.0
    const pathThroughNorthWall: Waypoint[] = [
      { x: 0, z: -18, level: 0 },
      { x: 0, z: -24, level: 0 },
    ]
    const valNorth = validateMultilevelRoute(pathThroughNorthWall)
    assert('Path cutting through north bar wall fails validateMultilevelRoute', valNorth.valid === false)
    assert('Failure reason is cut_through_wall', valNorth.reason === 'cut_through_wall')
    assert('Failure identifies collider', !!valNorth.collider)

    // Segment cutting through upper meeting room partition away from door
    const pathThroughPartition: Waypoint[] = [
      { x: -22, z: -16, level: 1 }, // CEO room
      { x: -16, z: -16, level: 1 }, // Rinjani room
    ]
    const valPartition = validateMultilevelRoute(pathThroughPartition)
    assert('Path cutting through solid partition between upper rooms fails', valPartition.valid === false)
    assert('Failure reason is cut_through_wall', valPartition.reason === 'cut_through_wall')
  }

  // ---------------------------------------------------------------------------
  // 8. Negative Test 2: Artificially Constructed Non-Stair Floor Teleport Fails
  // ---------------------------------------------------------------------------
  console.log('\n8. Negative Test 2: Floor Teleporting without Stair Fails:')
  {
    // Path jumping floors at (0, 0)
    const teleportRoute: Waypoint[] = [
      { x: 0, z: 0, level: 0 },
      { x: 0, z: 0, level: 1 },
    ]
    const valTeleport = validateMultilevelRoute(teleportRoute)
    assert('Path teleporting between floors at (0, 0) fails validateMultilevelRoute', valTeleport.valid === false)
    assert('Failure reason is inter_floor_transition_without_stair', valTeleport.reason === 'inter_floor_transition_without_stair')
    assert('Explanation mentions external courtyard stair', !!valTeleport.explanation && valTeleport.explanation.includes('external courtyard stair'))
  }

  // ---------------------------------------------------------------------------
  // 9. Negative Test 3: Path Targeting Level >= 2 Fails with Occupied Level Explanation
  // ---------------------------------------------------------------------------
  console.log('\n9. Negative Test 3: Level >= 2 or Negative Fails with Invariant Explanation:')
  {
    // Level 2 (roof rim datum)
    const level2Route: Waypoint[] = [
      { x: 0, z: 0, level: 0 },
      { x: 0, z: 0, level: 2 as unknown as Level },
    ]
    const valL2 = validateMultilevelRoute(level2Route)
    assert('Path targeting level 2 fails validateMultilevelRoute', valL2.valid === false)
    assert('Failure reason is invalid_level_boundary', valL2.reason === 'invalid_level_boundary')
    assert('Explanation clarifies level 2 is decorative roof rim datum', !!valL2.explanation && valL2.explanation.includes('decorative roof rim trim'))

    // Level 3 (invented 3rd floor / tower)
    const level3Route: Waypoint[] = [
      { x: 0, z: 0, level: 3 as unknown as Level },
    ]
    const valL3 = validateMultilevelRoute(level3Route)
    assert('Path targeting level 3 fails validateMultilevelRoute', valL3.valid === false)
    assert('Explanation explains strictly two occupied levels (0 and 1)', !!valL3.explanation && valL3.explanation.includes('two occupied levels (0 and 1)'))

    // Level -1
    const negRoute: Waypoint[] = [
      { x: 0, z: 0, level: -1 as unknown as Level },
    ]
    const valNeg = validateMultilevelRoute(negRoute)
    assert('Negative level fails validateMultilevelRoute', valNeg.valid === false)
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\nResults: ${checks - failures}/${checks} checks passed`)
  if (failures > 0) {
    console.error(`FAILED: ${failures} check(s) did not pass.`)
    process.exit(1)
  } else {
    console.log('ALL POLYGON PATH & NAVMESH CHECKS PASSED SUCCESSFULLY!\n')
  }
}

runTests().catch((err) => {
  console.error('Unhandled error during test run:', err)
  process.exit(1)
})
