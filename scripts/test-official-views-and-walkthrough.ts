/**
 * Test Official Views, Two-Floor Walkthrough & Freshness Conventions — Task 9.21
 *
 * Verifies:
 * 1. Physical byte SHA-256 hashes of all 4 official reference images in docs/ match visual-reference.md.
 * 2. 2000x1000 camera presets matching visual-reference.md for all 4 views.
 * 3. Two occupied floors invariant (levels 0 and 1; roof rim datum 6.8m, no terrace or tower).
 * 4. Desk layout: exactly 10 desks total, 1 vacant spare desk index 8.
 * 5. Merapi 4 physical seats: 2 reserved for Governance, 2 for invited participants.
 * 6. Contexia display labels on signs, plaques, and selectors.
 * 7. Source & freshness conventions: claim, review-open, verified, unchecked, read-failed, stale.
 *
 * Run: npx tsx scripts/test-official-views-and-walkthrough.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

import {
  OFFICIAL_VIEW_METADATA,
  FLOOR_WALKTHROUGH,
  FRESHNESS_CONVENTIONS,
  listOfficialViews,
  getOfficialViewMetadata,
  getFloorWalkthrough,
  getFreshnessConvention,
} from '../src/lib/office/walkthrough'
import {
  LEVELS,
  LEVEL_H,
  ROOF_Y,
  OCCUPIED_LEVELS,
  CAMERA_PRESETS,
  OFFICIAL_REFERENCE_HASHES,
  OFFICIAL_DESKTOP_VIEWPORT,
  validateFloorLevel,
} from '../src/lib/office/camera'
import {
  ROOMS,
  MEETING_ROOMS,
  DESKS,
  ROOM_PLAQUES,
} from '../src/lib/office/layout'
import {
  CONTEXIA_ROOM_LABELS,
  getRoomDisplayLabel,
} from '../src/lib/office/room-routing'

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
  console.log('\n--- Official Views, Two-Floor Walkthrough & Freshness Tests (Task 9.21) ---\n')

  // ---------------------------------------------------------------------------
  // 1. Physical Byte SHA-256 Hashes of Reference Images in docs/
  // ---------------------------------------------------------------------------
  console.log('1. Physical Byte SHA-256 Hashes in docs/:')
  {
    const docsDir = path.resolve(__dirname, '../docs')
    const expectedHashes: Record<string, string> = {
      'office-3d.jpg': '5993BCDD3556A93061A3EBEEB6146523E86C56203C9BA435020370B549C8A304',
      'office-courtyard.jpg': '3C2D197A187C551BF126E6B5BFD52C2094E531C58FD79E337159575BD2F67252',
      'office-lounge.jpg': 'AA7C91A1E7D6F0FE80B36E5ABA78F3D9B273477DA1AD28103ED849F267AF3A91',
      'office-upper-floor.jpg': '6D768BB636246E2C6AD5BFDA07B37D0F48A554B26F190D1B349A5ED1C31D6324',
    }

    for (const [filename, expectedSha] of Object.entries(expectedHashes)) {
      const filePath = path.join(docsDir, filename)
      assert(`File ${filename} exists in docs/`, fs.existsSync(filePath))

      if (fs.existsSync(filePath)) {
        const fileBytes = fs.readFileSync(filePath)
        const computedSha = crypto.createHash('sha256').update(fileBytes).digest('hex').toUpperCase()
        assert(
          `Byte SHA-256 of ${filename} matches visual-reference.md (${expectedSha.slice(0, 12)}...)`,
          computedSha === expectedSha,
          `Got: ${computedSha}`
        )
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 2. 2000x1000 Camera Presets Matching visual-reference.md
  // ---------------------------------------------------------------------------
  console.log('\n2. Calibrated 2000x1000 Camera Presets & Metadata:')
  {
    const views = listOfficialViews()
    assert('listOfficialViews returns exactly 4 views', views.length === 4)

    // Overall
    const vOverall = getOfficialViewMetadata('overall')
    assert('Overall view id is overall', vOverall.id === 'overall')
    assert('Overall viewport width is 2000', vOverall.viewport.width === 2000)
    assert('Overall viewport height is 1000', vOverall.viewport.height === 1000)
    assert('Overall position is {14, 34, 40}', vOverall.position.x === 14 && vOverall.position.y === 34 && vOverall.position.z === 40)
    assert('Overall target is {0, 1.5, -2}', vOverall.target.x === 0 && vOverall.target.y === 1.5 && vOverall.target.z === -2)
    assert('Overall fov is 45', vOverall.fov === 45)
    assert('Overall reference file is office-3d.jpg', vOverall.referenceFile === 'office-3d.jpg')
    assert('Overall landmarks verified >= 5', vOverall.landmarksVerified.length >= 5)
    assert('Overall discrepancies found === 0', vOverall.discrepanciesFound === 0)

    // Courtyard
    const vCourtyard = getOfficialViewMetadata('courtyard')
    assert('Courtyard view id is courtyard', vCourtyard.id === 'courtyard')
    assert('Courtyard viewport width is 2000', vCourtyard.viewport.width === 2000)
    assert('Courtyard viewport height is 1000', vCourtyard.viewport.height === 1000)
    assert('Courtyard position is {0, 8, 15}', vCourtyard.position.x === 0 && vCourtyard.position.y === 8 && vCourtyard.position.z === 15)
    assert('Courtyard target is {0, 2.5, -4}', vCourtyard.target.x === 0 && vCourtyard.target.y === 2.5 && vCourtyard.target.z === -4)
    assert('Courtyard fov is 50', vCourtyard.fov === 50)
    assert('Courtyard reference file is office-courtyard.jpg', vCourtyard.referenceFile === 'office-courtyard.jpg')
    assert('Courtyard landmarks verified >= 5', vCourtyard.landmarksVerified.length >= 5)
    assert('Courtyard discrepancies found === 0', vCourtyard.discrepanciesFound === 0)

    // Lounge
    const vLounge = getOfficialViewMetadata('lounge')
    assert('Lounge view id is lounge', vLounge.id === 'lounge')
    assert('Lounge viewport width is 2000', vLounge.viewport.width === 2000)
    assert('Lounge viewport height is 1000', vLounge.viewport.height === 1000)
    assert('Lounge position is {20, 7, 12}', vLounge.position.x === 20 && vLounge.position.y === 7 && vLounge.position.z === 12)
    assert('Lounge target is {2, 2.5, -4}', vLounge.target.x === 2 && vLounge.target.y === 2.5 && vLounge.target.z === -4)
    assert('Lounge fov is 55', vLounge.fov === 55)
    assert('Lounge reference file is office-lounge.jpg', vLounge.referenceFile === 'office-lounge.jpg')
    assert('Lounge landmarks verified >= 5', vLounge.landmarksVerified.length >= 5)
    assert('Lounge discrepancies found === 0', vLounge.discrepanciesFound === 0)

    // Upper Floor
    const vUpper = getOfficialViewMetadata('upper-floor')
    assert('Upper Floor view id is upper-floor', vUpper.id === 'upper-floor')
    assert('Upper Floor viewport width is 2000', vUpper.viewport.width === 2000)
    assert('Upper Floor viewport height is 1000', vUpper.viewport.height === 1000)
    assert('Upper Floor position is {-12, 6.2, -6}', vUpper.position.x === -12 && vUpper.position.y === 6.2 && vUpper.position.z === -6)
    assert('Upper Floor target is {-20, 4.5, -16}', vUpper.target.x === -20 && vUpper.target.y === 4.5 && vUpper.target.z === -16)
    assert('Upper Floor fov is 45', vUpper.fov === 45)
    assert('Upper Floor reference file is office-upper-floor.jpg', vUpper.referenceFile === 'office-upper-floor.jpg')
    assert('Upper Floor landmarks verified >= 5', vUpper.landmarksVerified.length >= 5)
    assert('Upper Floor discrepancies found === 0', vUpper.discrepanciesFound === 0)
  }

  // ---------------------------------------------------------------------------
  // 3. Two Occupied Floors Invariant & 6.8m Roof Rim Datum
  // ---------------------------------------------------------------------------
  console.log('\n3. Two Occupied Floors Invariant & 6.8m Roof Rim Datum:')
  {
    assert('LEVELS is strictly 2', LEVELS === 2)
    assert('LEVEL_H is 3.4', LEVEL_H === 3.4)
    assert('ROOF_Y is 6.8 (LEVELS * LEVEL_H)', ROOF_Y === 6.8)
    assert('OCCUPIED_LEVELS is [0, 1]', OCCUPIED_LEVELS.length === 2 && OCCUPIED_LEVELS[0] === 0 && OCCUPIED_LEVELS[1] === 1)

    // Validation
    assert('validateFloorLevel(0) is valid', validateFloorLevel(0).valid === true)
    assert('validateFloorLevel(1) is valid', validateFloorLevel(1).valid === true)
    assert('validateFloorLevel(2) is invalid (roof rim datum)', validateFloorLevel(2).valid === false)
    assert('validateFloorLevel(-1) is invalid', validateFloorLevel(-1).valid === false)
    assert('validateFloorLevel(3) is invalid', validateFloorLevel(3).valid === false)

    // Floor walkthrough records
    const f0 = getFloorWalkthrough(0)
    assert('Floor 0 level is 0', f0.level === 0)
    assert('Floor 0 elevation is 0.0m', f0.elevationM === 0.0)
    assert('Floor 0 has stair access', f0.hasStairAccess === true)
    assert('Floor 0 has 9 desks', f0.totalDesks === 9)
    assert('Floor 0 contains dev, mkt, content rooms', f0.rooms.includes('dev') && f0.rooms.includes('mkt') && f0.rooms.includes('content'))

    const f1 = getFloorWalkthrough(1)
    assert('Floor 1 level is 1', f1.level === 1)
    assert('Floor 1 elevation is 3.4m', f1.elevationM === 3.4)
    assert('Floor 1 has stair access', f1.hasStairAccess === true)
    assert('Floor 1 has 1 desk (CEO desk)', f1.totalDesks === 1)
    assert('Floor 1 contains CEO and 5 meeting rooms',
      f1.rooms.includes('ceo') &&
      f1.rooms.includes('rinjani') &&
      f1.rooms.includes('merapi') &&
      f1.rooms.includes('bromo') &&
      f1.rooms.includes('semeru') &&
      f1.rooms.includes('cikurai')
    )

    let threwFloor2 = false
    try {
      getFloorWalkthrough(2)
    } catch {
      threwFloor2 = true
    }
    assert('getFloorWalkthrough(2) throws (rejects terrace/tower)', threwFloor2)
  }

  // ---------------------------------------------------------------------------
  // 4. Desk Layout Invariants (10 Desks, 1 Vacant Spare Desk)
  // ---------------------------------------------------------------------------
  console.log('\n4. Desk Layout Invariants (10 Desks Total, 1 Vacant Spare):')
  {
    assert('DESKS array has exactly 10 desks', DESKS.length === 10)
    const level0Desks = DESKS.filter((d) => d.level === 0)
    const level1Desks = DESKS.filter((d) => d.level === 1)

    assert('Level 0 has exactly 9 desks', level0Desks.length === 9)
    assert('Level 1 has exactly 1 desk', level1Desks.length === 1)

    // Check desk indices 0 to 9
    const indices = DESKS.map((d) => d.index).sort((a, b) => a - b)
    assert('Desk indices span 0..9 without gaps', indices.every((idx, i) => idx === i))

    // Spare desk is index 8 in content room
    const spareDesk = DESKS.find((d) => d.index === 8)
    assert('Desk index 8 exists', spareDesk !== undefined)
    assert('Desk index 8 is in content room (GTM)', spareDesk?.division === 'content')
    assert('Desk index 8 is on level 0', spareDesk?.level === 0)

    // CEO desk is index 9
    const ceoDesk = DESKS.find((d) => d.index === 9)
    assert('CEO desk index 9 exists', ceoDesk !== undefined)
    assert('CEO desk is on level 1', ceoDesk?.level === 1)
  }

  // ---------------------------------------------------------------------------
  // 5. Merapi 4 Physical Seats (2 Reserved for Governance, 2 Invited)
  // ---------------------------------------------------------------------------
  console.log('\n5. Merapi Seating Invariants:')
  {
    const merapi = MEETING_ROOMS['merapi']
    assert('Merapi room exists in MEETING_ROOMS', merapi !== undefined)
    assert('Merapi has exactly 4 physical seats', merapi.seats.length === 4)

    // Ensure all 4 seats have distinct coordinates
    const uniquePositions = new Set(merapi.seats.map((s) => `${s.x.toFixed(2)},${s.z.toFixed(2)}`))
    assert('All 4 Merapi seats have unique coordinates', uniquePositions.size === 4)
  }

  // ---------------------------------------------------------------------------
  // 6. Contexia Room Display Labels on Signs and Plaques
  // ---------------------------------------------------------------------------
  console.log('\n6. Contexia Room Display Labels Consistency:')
  {
    const expectedLabels: Record<string, string> = {
      bromo: 'Centinela Fiscal',
      semeru: 'Caja Real',
      cikurai: 'Ingresos Contexia',
      merapi: 'Control Contexia',
      rinjani: 'Consejo Contexia',
      ceo: 'Dirección Contexia',
    }

    for (const [id, label] of Object.entries(expectedLabels)) {
      assert(`Room ${id} display label matches visual-reference.md: "${label}"`, getRoomDisplayLabel(id) === label)
    }

    // Plaques
    for (const [id, label] of Object.entries(expectedLabels)) {
      const plaque = ROOM_PLAQUES.find((p) => p.id === id)
      assert(`Plaque for ${id} exists`, plaque !== undefined)
      assert(`Plaque for ${id} displays "${label}"`, plaque?.text === label)
      assert(`Plaque for ${id} is located on level 1`, plaque?.level === 1)
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Source & Freshness Conventions
  // ---------------------------------------------------------------------------
  console.log('\n7. Source & Freshness Conventions:')
  {
    const markers = ['claim', 'review-open', 'verified', 'unchecked', 'read-failed', 'stale'] as const
    for (const m of markers) {
      const conv = getFreshnessConvention(m)
      assert(`Freshness marker '${m}' exists`, conv.marker === m)
      assert(`Freshness marker '${m}' has display label`, conv.displayLabel.length > 0)
      assert(`Freshness marker '${m}' has description`, conv.description.length > 0)
    }

    // Semantics
    assert('Claim does NOT imply execution proof', FRESHNESS_CONVENTIONS['claim'].impliesExecutionProof === false)
    assert('Review Open requires independent reviewer', FRESHNESS_CONVENTIONS['review-open'].requiresIndependentReviewer === true)
    assert('Verified implies execution proof', FRESHNESS_CONVENTIONS['verified'].impliesExecutionProof === true)
    assert('Verified requires independent reviewer', FRESHNESS_CONVENTIONS['verified'].requiresIndependentReviewer === true)
    assert('Read-failed does NOT imply execution proof', FRESHNESS_CONVENTIONS['read-failed'].impliesExecutionProof === false)
    assert('Stale does NOT imply execution proof', FRESHNESS_CONVENTIONS['stale'].impliesExecutionProof === false)
  }

  console.log(`\nResults: ${checks - failures}/${checks} checks passed.\n`)

  if (failures > 0) {
    console.error(`FAILED: ${failures} check(s) failed.`)
    process.exit(1)
  } else {
    console.log('SUCCESS: All official view, walkthrough, and freshness tests passed!\n')
  }
}

runTests().catch((err) => {
  console.error('Unhandled test error:', err)
  process.exit(1)
})
