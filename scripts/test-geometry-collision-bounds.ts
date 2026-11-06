/**
 * Test Geometry and Collision Bounds — Task 9.2
 *
 * Verifies:
 * 1. Ground shell extents (56m x 42m x 3.4m ceiling, 6.8m roof datum).
 * 2. Exactly two occupied levels (L0 ground, L1 upper north bar); strictly no 3rd occupied floor/terrace.
 * 3. Reception desk coordinates (-7.0, 18.6) and entrance doorway (0, 20.85) clearance.
 * 4. Courtyard boundary: pool solid bounds, gym area, daybeds, planters.
 * 5. Wall bounds and collision avoidance: solids list, nav grid impassable points.
 * 6. Four official camera presets matching the 4 official views at 2000x1000 and mobile viewports.
 *
 * Run: npx tsx scripts/test-geometry-collision-bounds.ts
 */

import {
  FLOOR,
  HALF_W,
  HALF_D,
  WALL_H,
  WALL_T,
  LEVELS,
  LEVEL_H,
  ROOF_Y,
  CEILING_Y,
  DOOR,
  LEVEL_BOUNDS,
  BARS,
  ROOMS,
  RECEPTION,
  POOL,
  GYM,
  PLANTING,
  SUNBEDS,
  GARDEN_BEDS,
  FOOTPRINTS,
} from '../src/lib/office/layout'
import {
  BODY_R,
  blocked,
} from '../src/lib/office/nav'
import {
  CAMERA_PRESETS,
  OFFICIAL_DESKTOP_VIEWPORT,
  OFFICIAL_MOBILE_VIEWPORT,
  OFFICIAL_REFERENCE_HASHES,
  computeAspectRatio,
  listCameraPresets,
} from '../src/lib/office/camera'

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

console.log('\n--- Virtual Office Geometry & Collision Bounds Tests (Task 9.2) ---\n')

// ---------------------------------------------------------------------------
// 1. Ground Shell Extents
// ---------------------------------------------------------------------------
console.log('1. Ground Shell Extents:')
{
  assert('ground width is exactly 56m', FLOOR.width === 56, `got ${FLOOR.width}`)
  assert('ground depth is exactly 42m', FLOOR.depth === 42, `got ${FLOOR.depth}`)
  assert('half-width is 28m', HALF_W === 28, `got ${HALF_W}`)
  assert('half-depth is 21m', HALF_D === 21, `got ${HALF_D}`)
  assert('wall/ceiling height is 3.4m', WALL_H === 3.4 && LEVEL_H === 3.4 && CEILING_Y === 3.4)
  assert('wall thickness is 0.3m', WALL_T === 0.3)
  assert('roof datum is 6.8m (LEVELS * LEVEL_H)', ROOF_Y === 6.8)
}

// ---------------------------------------------------------------------------
// 2. Occupied Levels (L0 Ground and L1 North Bar; No 3rd Floor or Terrace)
// ---------------------------------------------------------------------------
console.log('\n2. Occupied Levels Invariant:')
{
  assert('levels count is exactly 2', LEVELS === 2)
  assert(
    'level 0 bounds span full 56x42m footprint',
    LEVEL_BOUNDS[0].x1 === -28 &&
      LEVEL_BOUNDS[0].x2 === 28 &&
      LEVEL_BOUNDS[0].z1 === -21 &&
      LEVEL_BOUNDS[0].z2 === 21,
  )
  assert(
    'level 1 bounds span north bar only (z: -21..-9)',
    LEVEL_BOUNDS[1].x1 === -28 &&
      LEVEL_BOUNDS[1].x2 === 28 &&
      LEVEL_BOUNDS[1].z1 === -21 &&
      LEVEL_BOUNDS[1].z2 === -9,
  )
  assert('no level 2 bounds exist in layout', (LEVEL_BOUNDS as Record<number, unknown>)[2] === undefined)

  // Verify room levels
  const invalidLevelRooms = ROOMS.filter((r) => r.level !== 0 && r.level !== 1)
  assert('all rooms are strictly on level 0 or level 1', invalidLevelRooms.length === 0)

  const terraceOrRoofRooms = ROOMS.filter(
    (r) => r.id.toLowerCase().includes('terrace') && r.level === 1,
  )
  assert('no upper-floor rooftop terrace room exists', terraceOrRoofRooms.length === 0)

  // Verify enclosed upper floor room count: CEO + 5 meeting rooms = 6
  const upperEnclosedRooms = ROOMS.filter((r) => r.level === 1 && r.id !== 'corridor1')
  assert('upper floor has exactly 6 enclosed rooms (CEO + 5 meetings)', upperEnclosedRooms.length === 6)
  const roomIds = new Set(upperEnclosedRooms.map((r) => r.id))
  assert(
    'upper rooms are ceo, rinjani, merapi, bromo, semeru, cikurai',
    ['ceo', 'rinjani', 'merapi', 'bromo', 'semeru', 'cikurai'].every((id) => roomIds.has(id)),
  )
}

// ---------------------------------------------------------------------------
// 3. Reception Desk and Entrance Clearance
// ---------------------------------------------------------------------------
console.log('\n3. Reception Desk & Entrance Clearance:')
{
  assert('reception x is -7.0', RECEPTION.x === -7.0)
  assert('reception z is 18.6', RECEPTION.z === 18.6)

  const recFp = FOOTPRINTS.find((f) => f.id === 'reception')
  assert('reception footprint exists at (-7.0, 18.6)', recFp !== undefined && recFp.x === -7.0 && recFp.z === 18.6)
  assert('reception desk dimensions are hw=1.8, hd=0.45', recFp !== undefined && recFp.hw === 1.8 && recFp.hd === 0.45)

  const chairFp = FOOTPRINTS.find((f) => f.id === 'reception-chair')
  assert('reception chair is placed behind counter (z=17.45 < 18.6)', chairFp !== undefined && Math.abs(chairFp.z - 17.45) < 0.001 && chairFp.z < 18.6)

  // Entrance door at (0, 20.85)
  assert('entrance door is centered on south wall at x=0', DOOR.x === 0)
  assert('entrance door z is 20.85', Math.abs(DOOR.z - 20.85) < 0.01)

  // Entrance clearance to reception desk
  const clearance = Math.abs(DOOR.x - RECEPTION.x)
  assert('entrance axis clearance to reception counter is 7.0m', clearance === 7.0)
  assert('clearance exceeds door opening + counter half-width + body radius', clearance > (2.2 + 1.8 + BODY_R))

  // Walking through entrance is clear
  assert('entrance doorway approach is unblocked', !blocked(DOOR.x, HALF_D - WALL_T - 0.8, BODY_R, { level: 0 }))
  // Reception desk is solid
  assert('reception counter is solid', blocked(RECEPTION.x, RECEPTION.z, BODY_R, { level: 0 }))
}

// ---------------------------------------------------------------------------
// 4. Courtyard Boundary: Pool, Gym, Sunbeds, Planters
// ---------------------------------------------------------------------------
console.log('\n4. Courtyard Boundary & Landmarks:')
{
  assert('courtyard bar bounds are x: -14..14, z: -9..16',
    BARS.courtyard.x1 === -14 && BARS.courtyard.x2 === 14 &&
    BARS.courtyard.z1 === -9 && BARS.courtyard.z2 === 16)

  // Pool
  assert('pool center is (0, 4) with w=12, d=7',
    POOL.x === 0 && POOL.z === 4 && POOL.w === 12 && POOL.d === 7)
  assert('pool water surface is impassable for walking (cannot walk on water)',
    blocked(POOL.x, POOL.z, BODY_R, { level: 0 }))

  // Gym
  assert('gym mat bounds are x: -6.5..6.5, z: -9.0..-2.4',
    GYM.x1 === -6.5 && GYM.x2 === 6.5 && GYM.z1 === -9.0 && GYM.z2 === -2.4)
  assert('barbell rack is at (-4.2, -5.6)', GYM.rack.x === -4.2 && GYM.rack.z === -5.6)
  assert('dumbbell rack is at (4.2, -5.6)', GYM.dumbbells.x === 4.2 && GYM.dumbbells.z === -5.6)
  assert('pull-up rig is at (0, -7.6) with span 3.0m', GYM.rig.x === 0 && GYM.rig.z === -7.6 && GYM.rig.span === 3.0)

  // Sunbeds
  assert('three timber sunbeds exist west of pool', SUNBEDS.length === 3)
  for (const [i, sb] of SUNBEDS.entries()) {
    assert(`sunbed ${i} is at x=-9.6 facing east (PI/2)`, sb.x === -9.6 && sb.facing === Math.PI / 2)
  }

  // Planting band
  assert('planting band sits between gym and pool (-2.4..-0.8)',
    PLANTING.z1 >= GYM.z2 && PLANTING.z2 <= (POOL.z - POOL.d / 2))
  assert('planting band has 9 plants', PLANTING.count === 9)

  // Garden beds
  assert('low garden beds exist on courtyard east/west edges', GARDEN_BEDS.length === 2)
}

// ---------------------------------------------------------------------------
// 5. Wall Bounds and Collision Avoidance
// ---------------------------------------------------------------------------
console.log('\n5. Wall Bounds & Collision Avoidance:')
{
  // Outside building is blocked
  assert('point east of building (x=30, z=0) is blocked', blocked(30, 0, BODY_R, { level: 0 }))
  assert('point west of building (x=-30, z=0) is blocked', blocked(-30, 0, BODY_R, { level: 0 }))
  assert('point south of building (x=0, z=25) is blocked', blocked(0, 25, BODY_R, { level: 0 }))
  assert('point north of building (x=0, z=-25) is blocked', blocked(0, -25, BODY_R, { level: 0 }))

  // Walking off level 1 north bar (e.g. at z=0) is blocked
  assert('stepping off level 1 north bar (x=0, z=0, level 1) is blocked', blocked(0, 0, BODY_R, { level: 1 }))

  // Dividing wall between west rooms and courtyard
  assert('west dividing wall at x=-14, z=5 is blocked', blocked(-14, 5, BODY_R, { level: 0 }))

  // Interior circulation is walkable
  assert('lobby circulation center (0, 18) is walkable', !blocked(0, 18, BODY_R, { level: 0 }))
  assert('courtyard pool deck walkway (0, 9) is walkable', !blocked(0, 9, BODY_R, { level: 0 }))
  assert('level 1 corridor (0, -10.5, level 1) is walkable', !blocked(0, -10.5, BODY_R, { level: 1 }))
}

// ---------------------------------------------------------------------------
// 6. Camera Presets Matching Official References
// ---------------------------------------------------------------------------
console.log('\n6. Camera Presets Matching Official References:')
{
  const presets = listCameraPresets()
  assert('exactly 4 official camera presets exist', presets.length === 4)

  const presetIds = new Set(presets.map((p) => p.id))
  assert('presets cover overall, courtyard, lounge, upper-floor',
    ['overall', 'courtyard', 'lounge', 'upper-floor'].every((id) => presetIds.has(id as any)))

  // Verify SHA256 hashes matching visual-reference.md
  for (const p of presets) {
    const expectedHash = OFFICIAL_REFERENCE_HASHES[p.referenceImage]
    assert(`preset ${p.id} references ${p.referenceImage} with correct SHA256`,
      expectedHash !== undefined && p.referenceSha256 === expectedHash)
  }

  // Verify viewports and aspect ratios
  assert('official desktop viewport is 2000x1000',
    OFFICIAL_DESKTOP_VIEWPORT.width === 2000 && OFFICIAL_DESKTOP_VIEWPORT.height === 1000)
  assert('official mobile viewport is 390x844',
    OFFICIAL_MOBILE_VIEWPORT.width === 390 && OFFICIAL_MOBILE_VIEWPORT.height === 844)

  const desktopAspect = computeAspectRatio(OFFICIAL_DESKTOP_VIEWPORT)
  assert('desktop aspect ratio is 2.0', Math.abs(desktopAspect - 2.0) < 0.001)

  const mobileAspect = computeAspectRatio(OFFICIAL_MOBILE_VIEWPORT)
  assert('mobile aspect ratio matches 390/844', Math.abs(mobileAspect - 390 / 844) < 0.001)

  // Verify preset fields
  for (const p of presets) {
    assert(`preset ${p.id} has positive FOV (${p.fov})`, p.fov > 0 && p.fov <= 90)
    assert(`preset ${p.id} has zoom 1.0`, p.zoom === 1.0)
    assert(`preset ${p.id} has valid min/max distances`, p.minDistance > 0 && p.maxDistance > p.minDistance)
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${checks - failures}/${checks} checks passed`)
if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED!`)
  process.exit(1)
} else {
  console.log('\nAll geometry and collision bounds checks passed successfully!\n')
}
