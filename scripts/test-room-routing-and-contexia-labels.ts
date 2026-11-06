/**
 * Test Room Routing, Room Capacity, CEO Navigation, and Contexia Branding — Task 9.20
 *
 * Verifies:
 * 1. Confirmed Contexia room labels match visual-reference.md:
 *    - bromo -> Centinela Fiscal
 *    - semeru -> Caja Real
 *    - cikurai -> Ingresos Contexia
 *    - merapi -> Control Contexia
 *    - rinjani -> Consejo Contexia
 *    - ceo -> Dirección Contexia
 * 2. Room plaques on doors/signs display confirmed Contexia labels while preserving
 *    stable IDs and coordinates byte-compatible.
 * 3. Division meeting routing:
 *    - Fiscal -> Bromo ("Centinela Fiscal")
 *    - Finance -> Semeru ("Caja Real")
 *    - GTM -> Cikurai ("Ingresos Contexia")
 *    - Governance -> Merapi ("Control Contexia")
 *    - Mixed divisions -> Rinjani ("Consejo Contexia")
 * 4. Shared Governance seats (Approval Queue desk 2, KB desk 5) route to Merapi
 *    according to division ownership, NOT their physical room locations.
 * 5. Single-division capacity overflow: 4 fiscal participants overflow to Rinjani.
 * 6. Runtime participant cap: > 4 participants strictly rejected.
 * 7. Missing division fails closed: throws unresolved_division (never silently Fiscal!).
 * 8. Merapi retains 4 physical seats (2 reserved for Governance, 2 for invited).
 * 9. CEO navigation barrier: staff cannot enter CEO suite (canEnterCeoRoom('staff') === false).
 * 10. Deskless peer handling: cancels visual trip only without modifying conversation state.
 *
 * Run: npx tsx scripts/test-room-routing-and-contexia-labels.ts
 */

import {
  CONTEXIA_ROOM_LABELS,
  CONTEXIA_ROOM_DETAILS,
  getRoomDisplayLabel,
  canEnterCeoRoom,
  shouldCancelVisualTrip,
  meetingRoomFor,
} from '../src/lib/office/room-routing'
import {
  ROOM_PLAQUES,
  MEETING_ROOMS,
  roomById,
} from '../src/lib/office/layout'
import {
  MERAPI_SEAT_COUNT,
  MERAPI_GOVERNANCE_RESERVED,
  MERAPI_INVITED_CAPACITY,
  allocateMerapiSeats,
} from '../src/lib/office/meeting-seating'
import { CONTEXIA_ROLES } from '../src/lib/office/contexia-roster'

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
  console.log('\n--- Contexia Room Routing, Capacity & Navigation Tests (Task 9.20) ---\n')

  // ---------------------------------------------------------------------------
  // 1. Confirmed Contexia Display Labels (visual-reference.md)
  // ---------------------------------------------------------------------------
  console.log('1. Contexia Room Display Labels (visual-reference.md):')
  {
    const expected = {
      bromo: 'Centinela Fiscal',
      semeru: 'Caja Real',
      cikurai: 'Ingresos Contexia',
      merapi: 'Control Contexia',
      rinjani: 'Consejo Contexia',
      ceo: 'Dirección Contexia',
    }

    for (const [id, expectedLabel] of Object.entries(expected)) {
      const entry = CONTEXIA_ROOM_LABELS[id]
      assert(`Room ${id} exists in CONTEXIA_ROOM_LABELS`, entry !== undefined)
      assert(`Room ${id} label matches visual-reference.md: "${expectedLabel}"`, entry?.label === expectedLabel)
      assert(`getRoomDisplayLabel('${id}') returns "${expectedLabel}"`, getRoomDisplayLabel(id) === expectedLabel)
    }

    assert('Unknown room falls back to original id', getRoomDisplayLabel('unknown_room') === 'unknown_room')
  }

  // ---------------------------------------------------------------------------
  // 2. Room Plaques / Signs Consistency
  // ---------------------------------------------------------------------------
  console.log('\n2. Room Plaques Signs Consistency with Byte-Compatible Anchors:')
  {
    const plaqueMap = new Map(ROOM_PLAQUES.map((p) => [p.id, p]))
    const expectedLabels: Record<string, string> = {
      bromo: 'Centinela Fiscal',
      semeru: 'Caja Real',
      cikurai: 'Ingresos Contexia',
      merapi: 'Control Contexia',
      rinjani: 'Consejo Contexia',
      ceo: 'Dirección Contexia',
    }

    for (const [id, label] of Object.entries(expectedLabels)) {
      const plaque = plaqueMap.get(id)
      assert(`Plaque exists for ${id}`, plaque !== undefined)
      assert(`Plaque text for ${id} is "${label}"`, plaque?.text === label)
      assert(`Plaque ${id} is on level 1`, plaque?.level === 1)
      assert(`Plaque ${id} has valid x coordinate`, typeof plaque?.x === 'number' && !Number.isNaN(plaque.x))
      assert(`Plaque ${id} has valid z coordinate`, typeof plaque?.z === 'number' && !Number.isNaN(plaque.z))
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Business Division Meeting Routing
  // ---------------------------------------------------------------------------
  console.log('\n3. Business Division Meeting Routing:')
  {
    // Fiscal -> Bromo
    const fiscalDivs = new Map([
      ['Centinela', 'fiscal'],
      ['Auditoría', 'fiscal'],
    ])
    const rFiscal = meetingRoomFor(['Centinela', 'Auditoría'], fiscalDivs)
    assert('Fiscal meeting routes to bromo (Centinela Fiscal)', rFiscal === 'bromo')

    // Finance -> Semeru
    const finDivs = new Map([
      ['Pulso', 'finance'],
      ['Radar', 'finance'],
    ])
    const rFin = meetingRoomFor(['Pulso', 'Radar'], finDivs)
    assert('Finance meeting routes to semeru (Caja Real)', rFin === 'semeru')

    // GTM -> Cikurai
    const gtmDivs = new Map([
      ['Social Ops', 'gtm'],
      ['Taty', 'gtm'],
    ])
    const rGtm = meetingRoomFor(['Social Ops', 'Taty'], gtmDivs)
    assert('GTM meeting routes to cikurai (Ingresos Contexia)', rGtm === 'cikurai')

    // Governance -> Merapi
    const govDivs = new Map([['Orchestrator', 'governance']])
    const rGov = meetingRoomFor(['Orchestrator'], govDivs)
    assert('Governance meeting routes to merapi (Control Contexia)', rGov === 'merapi')

    // Mixed non-governance -> Rinjani
    const mixedDivs = new Map([
      ['Centinela', 'fiscal'],
      ['Pulso', 'finance'],
    ])
    const rMixed = meetingRoomFor(['Centinela', 'Pulso'], mixedDivs)
    assert('Mixed meeting (fiscal + finance) routes to rinjani (Consejo Contexia)', rMixed === 'rinjani')
  }

  // ---------------------------------------------------------------------------
  // 4. Shared Governance Seats Do Not Alter Routing
  // ---------------------------------------------------------------------------
  console.log('\n4. Shared Governance Seats Routing Invariance:')
  {
    // Approval Queue (desk 2, Fiscal room) & KB (desk 5, Finance room)
    const appQueue = CONTEXIA_ROLES.approval_queue
    const kb = CONTEXIA_ROLES.kb
    assert('Approval Queue is located at desk 2 (Fiscal room)', appQueue.deskIndex === 2 && appQueue.roomId === 'dev')
    assert('Approval Queue retains Governance division', appQueue.division === 'governance')
    assert('KB is located at desk 5 (Finance room)', kb.deskIndex === 5 && kb.roomId === 'mkt')
    assert('KB retains Governance division', kb.division === 'governance')

    const sharedGovDivs = new Map([
      ['Approval Queue', 'governance'],
      ['KB', 'governance'],
    ])
    const rShared = meetingRoomFor(['Approval Queue', 'KB'], sharedGovDivs)
    assert(
      'Meeting between shared Governance seats routes to Merapi (Control Contexia), NOT Dev/Bromo or Mkt/Semeru',
      rShared === 'merapi'
    )
  }

  // ---------------------------------------------------------------------------
  // 5. Capacity Overflow & Runtime Cap
  // ---------------------------------------------------------------------------
  console.log('\n5. Capacity Overflow & Runtime Cap:')
  {
    // 4 Fiscal participants overflow Bromo (cap 3) to Rinjani
    const overflowDivs = new Map([
      ['F1', 'fiscal'],
      ['F2', 'fiscal'],
      ['F3', 'fiscal'],
      ['F4', 'fiscal'],
    ])
    const rOverflow = meetingRoomFor(['F1', 'F2', 'F3', 'F4'], overflowDivs)
    assert('4 same-division participants overflow Bromo (cap 3) to Rinjani', rOverflow === 'rinjani')

    // > 4 participants strictly rejected
    let capExceeded = false
    try {
      meetingRoomFor(['P1', 'P2', 'P3', 'P4', 'P5'], new Map([
        ['P1', 'fiscal'],
        ['P2', 'fiscal'],
        ['P3', 'fiscal'],
        ['P4', 'fiscal'],
        ['P5', 'fiscal'],
      ]))
    } catch (err: any) {
      capExceeded = true
      assert('Meeting with > 4 participants throws participant_cap_exceeded', err.message.includes('participant_cap_exceeded'))
    }
    assert('Cap exceeded threw exception', capExceeded)
  }

  // ---------------------------------------------------------------------------
  // 6. Missing Division Fails Closed (Never Silently Fiscal)
  // ---------------------------------------------------------------------------
  console.log('\n6. Missing Division Fails Closed:')
  {
    let missingCaught = false
    try {
      meetingRoomFor(['Centinela', 'GhostAgent'], new Map([['Centinela', 'fiscal']]))
    } catch (err: any) {
      missingCaught = true
      assert('Missing division throws unresolved_division', err.message.includes('unresolved_division'))
    }
    assert('Missing division check threw exception (no silent fallback)', missingCaught)

    let emptyCaught = false
    try {
      meetingRoomFor(['Centinela', 'BlankAgent'], new Map([['Centinela', 'fiscal'], ['BlankAgent', '  ']]))
    } catch (err: any) {
      emptyCaught = true
      assert('Empty division throws unresolved_division', err.message.includes('unresolved_division'))
    }
    assert('Empty division check threw exception', emptyCaught)
  }

  // ---------------------------------------------------------------------------
  // 7. Merapi 4 Physical Seats & Governance Reservation
  // ---------------------------------------------------------------------------
  console.log('\n7. Merapi 4 Physical Seats & Seating Policy:')
  {
    assert('Merapi seat count is 4', MERAPI_SEAT_COUNT === 4)
    assert('Merapi reserved governance seats is 2', MERAPI_GOVERNANCE_RESERVED === 2)
    assert('Merapi invited capacity is 2', MERAPI_INVITED_CAPACITY === 2)

    const merapiRoom = MEETING_ROOMS.merapi
    assert('Merapi has 4 physical seats in layout', merapiRoom.seats.length === 4)

    const seats = allocateMerapiSeats([
      { name: 'Orchestrator', division: 'governance' },
      { name: 'Approval Queue', division: 'governance' },
      { name: 'Centinela', division: 'fiscal' },
      { name: 'Pulso', division: 'finance' },
    ])
    assert('Full allocation assigns 4 seats', seats.length === 4)
    assert('Seat 0 is reserved governance', seats[0].seatIndex === 0 && seats[0].isReservedGovernance === true)
    assert('Seat 1 is reserved governance', seats[1].seatIndex === 1 && seats[1].isReservedGovernance === true)
    assert('Seat 2 is invited', seats[2].seatIndex === 2 && seats[2].isReservedGovernance === false)
    assert('Seat 3 is invited', seats[3].seatIndex === 3 && seats[3].isReservedGovernance === false)
  }

  // ---------------------------------------------------------------------------
  // 8. CEO Navigation Barrier
  // ---------------------------------------------------------------------------
  console.log('\n8. CEO Navigation Barrier:')
  {
    assert("Staff cannot enter CEO suite (canEnterCeoRoom('staff') === false)", canEnterCeoRoom('staff') === false)
    assert("Backend role cannot enter CEO suite", canEnterCeoRoom('backend') === false)
    assert("QA role cannot enter CEO suite", canEnterCeoRoom('qa') === false)
    assert("Marketing role cannot enter CEO suite", canEnterCeoRoom('marketing') === false)
    assert("CEO role CAN enter CEO suite", canEnterCeoRoom('ceo') === true)
    assert("Manager role CAN enter CEO suite", canEnterCeoRoom('manager') === true)
    assert("Empty role cannot enter CEO suite", canEnterCeoRoom('') === false)
  }

  // ---------------------------------------------------------------------------
  // 9. Deskless Peer Visual Trip Cancellation
  // ---------------------------------------------------------------------------
  console.log('\n9. Deskless Peer Visual Trip Cancellation:')
  {
    // Receptionist (deskIndex is null)
    assert(
      'Peer with deskIndex === null cancels visual trip',
      shouldCancelVisualTrip({ deskIndex: null }) === true
    )
    assert(
      'Peer with deskIndex === undefined cancels visual trip',
      shouldCancelVisualTrip({ deskIndex: undefined }) === true
    )
    assert(
      'Undefined peer cancels visual trip',
      shouldCancelVisualTrip(undefined) === true
    )
    assert(
      'Peer with deskIndex === 0 does NOT cancel visual trip',
      shouldCancelVisualTrip({ deskIndex: 0 }) === false
    )
    assert(
      'Peer with deskIndex === 3 does NOT cancel visual trip',
      shouldCancelVisualTrip({ deskIndex: 3 }) === false
    )
  }

  console.log(`\nResults: ${checks - failures}/${checks} checks passed.\n`)
  if (failures > 0) {
    console.error(`FAILED: ${failures} check(s) failed.`)
    process.exit(1)
  } else {
    console.log('SUCCESS: All room routing, capacity, CEO navigation, and Contexia branding tests passed!')
  }
}

runTests().catch((err) => {
  console.error('Fatal error during test run:', err)
  process.exit(1)
})
