/**
 * Test Meeting Rooms, Merapi Seating Policy, and Contexia Room Branding — Task 9.5
 *
 * Verifies:
 * 1. North-bar Upper CEO (`ceo`), 5 meeting rooms (`rinjani`, `merapi`, `bromo`, `semeru`, `cikurai`),
 *    and glass corridor (`corridor1`) with unchanged geometry, levels, and boundaries.
 * 2. `merapi` has 4 physical seats: 2 reserved for Governance, 2 for invited participants.
 * 3. `allocateMerapiSeats` allocates reserved seats [0, 1] to Governance and invited seats [2, 3] to others.
 * 4. Rejection when participants > 4 or invited participants > 2 (strictly no silent truncation).
 * 5. `resolveMeetingRoom` maps Contexia and legacy divisions, routes small governance meetings to Merapi,
 *    and overflows to Rinjani.
 * 6. Contexia display labels map correctly to visual-reference.md while preserving stable room IDs.
 * 7. `startMeeting` in src/lib/hermes/meeting.ts rejects when participants > 4 without silent drop.
 *
 * Run: npx tsx scripts/test-meeting-rooms-and-seating.ts
 */

import {
  ROOMS,
  MEETING_ROOMS,
  MEETING_ROOM_IDS,
  roomById,
} from '../src/lib/office/layout'
import {
  MERAPI_SEAT_COUNT,
  MERAPI_GOVERNANCE_RESERVED,
  MERAPI_INVITED_CAPACITY,
  CONTEXIA_ROOM_LABELS,
  DIVISION_ROOM_MAP,
  allocateMerapiSeats,
  resolveMeetingRoom,
} from '../src/lib/office/meeting-seating'
import { startMeeting } from '../src/lib/hermes/meeting'

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
  console.log('\n--- Meeting Rooms, Merapi Seating & Room Branding Tests (Task 9.5) ---\n')

  // ---------------------------------------------------------------------------
  // 1. North-Bar Upper CEO, 5 Meeting Rooms & Glass Corridor Geometry
  // ---------------------------------------------------------------------------
  console.log('1. North-Bar Upper Floor Geometry & Room Boundaries:')
  {
    // CEO room
    const ceo = roomById('ceo')
    assert('CEO room exists in layout.ts', ceo !== undefined)
    assert('CEO room is on level 1', ceo?.level === 1)
    assert('CEO room x1 is inner face of west wall (-27.85)', Math.abs((ceo?.x1 ?? 0) - (-27.85)) < 0.001)
    assert('CEO room x2 is -19.3', Math.abs((ceo?.x2 ?? 0) - (-19.3)) < 0.001)
    assert('CEO room z2 is -11.5 (faces executive corridor)', ceo?.z2 === -11.5)

    // Glass corridor (corridor1)
    const corridor = roomById('corridor1')
    assert('Executive corridor (corridor1) exists in layout.ts', corridor !== undefined)
    assert('corridor1 is on level 1', corridor?.level === 1)
    assert('corridor1 spans full bar width x: -27.85..27.85', Math.abs((corridor?.x1 ?? 0) - (-27.85)) < 0.001 && Math.abs((corridor?.x2 ?? 0) - 27.85) < 0.001)
    assert('corridor1 south edge is -9 + WALL_T/2', Math.abs((corridor?.z2 ?? 0) - (-8.85)) < 0.001)

    // Five meeting rooms
    const meetingIds = ['rinjani', 'merapi', 'bromo', 'semeru', 'cikurai'] as const
    for (const id of meetingIds) {
      const r = roomById(id)
      assert(`Room ${id} exists in layout.ts`, r !== undefined)
      assert(`Room ${id} is on level 1`, r?.level === 1)
      assert(`Room ${id} south edge aligns with corridor at z=-11.5`, r?.z2 === -11.5)
      assert(`Room ${id} has valid entrance door on south wall`, r?.door !== undefined && r?.door?.z === -11.5)
    }

    // Verify upper floor enclosed rooms count equals 6 (CEO + 5 meeting rooms)
    const upperEnclosed = ROOMS.filter((r) => r.level === 1 && r.id !== 'corridor1')
    assert('Upper floor has exactly 6 enclosed rooms (CEO + 5 meeting rooms)', upperEnclosed.length === 6)
  }

  // ---------------------------------------------------------------------------
  // 2. Physical Meeting Seats and Merapi Seat Count
  // ---------------------------------------------------------------------------
  console.log('\n2. Meeting Room Physical Seats & Merapi Constants:')
  {
    assert('MERAPI_SEAT_COUNT constant is 4', MERAPI_SEAT_COUNT === 4)
    assert('MERAPI_GOVERNANCE_RESERVED constant is 2', MERAPI_GOVERNANCE_RESERVED === 2)
    assert('MERAPI_INVITED_CAPACITY constant is 2', MERAPI_INVITED_CAPACITY === 2)
    assert(
      'Reserved + Invited equals total Merapi seats',
      MERAPI_GOVERNANCE_RESERVED + MERAPI_INVITED_CAPACITY === MERAPI_SEAT_COUNT
    )

    const merapiRoom = MEETING_ROOMS.merapi
    assert('MEETING_ROOMS has merapi defined', merapiRoom !== undefined)
    assert('merapi has exactly 4 physical seats', merapiRoom.seats.length === 4)

    // Verify other meeting room seat counts unchanged
    assert('rinjani has exactly 10 physical seats', MEETING_ROOMS.rinjani.seats.length === 10)
    assert('bromo has exactly 3 physical seats', MEETING_ROOMS.bromo.seats.length === 3)
    assert('semeru has exactly 3 physical seats', MEETING_ROOMS.semeru.seats.length === 3)
    assert('cikurai has exactly 3 physical seats', MEETING_ROOMS.cikurai.seats.length === 3)
  }

  // ---------------------------------------------------------------------------
  // 3. Merapi Seating Allocation: Governance Reservations & Invited Seats
  // ---------------------------------------------------------------------------
  console.log('\n3. Merapi Seating Allocation:')
  {
    // Case A: 2 Governance + 2 Invited
    const fullMeeting = [
      { name: 'orchestrator', division: 'governance' },
      { name: 'approval_queue', division: 'governance' },
      { name: 'centinela', division: 'fiscal' },
      { name: 'pulso', division: 'finance' },
    ]
    const allocFull = allocateMerapiSeats(fullMeeting)
    assert('Full 4-seat allocation returns 4 assignments', allocFull.length === 4)

    const govSeats = allocFull.filter((a) => a.isReservedGovernance)
    assert('Exactly 2 seats allocated as reserved Governance', govSeats.length === 2)
    assert('Governance members assigned to seat indices [0, 1]', govSeats[0].seatIndex === 0 && govSeats[1].seatIndex === 1)
    assert('Orchestrator gets seat 0', allocFull.find((a) => a.participant === 'orchestrator')?.seatIndex === 0)
    assert('Approval Queue gets seat 1', allocFull.find((a) => a.participant === 'approval_queue')?.seatIndex === 1)

    const invitedSeats = allocFull.filter((a) => !a.isReservedGovernance)
    assert('Exactly 2 seats allocated as invited (non-governance)', invitedSeats.length === 2)
    assert('Invited members assigned to seat indices [2, 3]', invitedSeats[0].seatIndex === 2 && invitedSeats[1].seatIndex === 3)

    // Case B: 1 Governance + 2 Invited
    const partialGov = [
      { name: 'orchestrator', division: 'governance' },
      { name: 'centinela', division: 'fiscal' },
      { name: 'social_ops', division: 'gtm' },
    ]
    const allocPartial = allocateMerapiSeats(partialGov)
    assert('3-participant allocation returns 3 assignments', allocPartial.length === 3)
    assert('Single governance member gets reserved seat 0', allocPartial[0].seatIndex === 0 && allocPartial[0].isReservedGovernance)
    assert('Two invited members get seats 2 and 3', allocPartial[1].seatIndex === 2 && allocPartial[2].seatIndex === 3)

    // Case C: Legacy division 'exec' mapped to governance
    const legacyExec = [
      { name: 'ceo', division: 'exec' },
      { name: 'dev', division: 'tech' },
    ]
    const allocLegacy = allocateMerapiSeats(legacyExec)
    assert('Legacy exec member gets reserved seat 0', allocLegacy[0].seatIndex === 0 && allocLegacy[0].isReservedGovernance)
    assert('Legacy tech member gets invited seat 2', allocLegacy[1].seatIndex === 2 && !allocLegacy[1].isReservedGovernance)
  }

  // ---------------------------------------------------------------------------
  // 4. Seating Constraints & Capacity Rejection
  // ---------------------------------------------------------------------------
  console.log('\n4. Capacity Limits and Rejection:')
  {
    // Rejection when participants > 4
    let rejectedCap = false
    let errMsgCap = ''
    try {
      allocateMerapiSeats([
        { name: 'p1', division: 'governance' },
        { name: 'p2', division: 'governance' },
        { name: 'p3', division: 'fiscal' },
        { name: 'p4', division: 'finance' },
        { name: 'p5', division: 'gtm' },
      ])
    } catch (e) {
      rejectedCap = true
      errMsgCap = (e as Error).message
    }
    assert('Rejects when participant count > 4', rejectedCap)
    assert('Error message mentions Merapi capacity is 4 seats', errMsgCap.includes('Merapi capacity is 4 seats'))

    // Rejection when invited participants > 2
    let rejectedInv = false
    let errMsgInv = ''
    try {
      allocateMerapiSeats([
        { name: 'orchestrator', division: 'governance' },
        { name: 'centinela', division: 'fiscal' },
        { name: 'pulso', division: 'finance' },
        { name: 'taty', division: 'gtm' },
      ])
    } catch (e) {
      rejectedInv = true
      errMsgInv = (e as Error).message
    }
    assert('Rejects when invited participants > 2', rejectedInv)
    assert('Error message mentions Merapi invited capacity is 2 seats', errMsgInv.includes('Merapi invited capacity is 2 seats'))
  }

  // ---------------------------------------------------------------------------
  // 5. Deterministic Meeting Room Routing
  // ---------------------------------------------------------------------------
  console.log('\n5. Deterministic Meeting Room Routing:')
  {
    // Small governance meeting <= 4 -> Merapi
    const divMap = new Map<string, string>([
      ['orchestrator', 'governance'],
      ['centinela', 'fiscal'],
    ])
    const r1 = resolveMeetingRoom(['orchestrator', 'centinela'], divMap)
    assert('Small governance meeting (<= 4) routes to merapi', r1.roomId === 'merapi')
    assert('merapi label is Control Contexia', r1.label === 'Control Contexia')

    // Single division meetings
    const fiscalMap = new Map<string, string>([
      ['centinela', 'fiscal'],
      ['auditoria', 'fiscal'],
    ])
    const rFiscal = resolveMeetingRoom(['centinela', 'auditoria'], fiscalMap)
    assert('Single fiscal division routes to bromo', rFiscal.roomId === 'bromo')
    assert('bromo label is Centinela Fiscal', rFiscal.label === 'Centinela Fiscal')

    const financeMap = new Map<string, string>([
      ['pulso', 'finance'],
      ['radar', 'finance'],
    ])
    const rFinance = resolveMeetingRoom(['pulso', 'radar'], financeMap)
    assert('Single finance division routes to semeru', rFinance.roomId === 'semeru')
    assert('semeru label is Caja Real', rFinance.label === 'Caja Real')

    const gtmMap = new Map<string, string>([
      ['social_ops', 'gtm'],
      ['taty', 'gtm'],
    ])
    const rGtm = resolveMeetingRoom(['social_ops', 'taty'], gtmMap)
    assert('Single gtm division routes to cikurai', rGtm.roomId === 'cikurai')
    assert('cikurai label is Ingresos Contexia', rGtm.label === 'Ingresos Contexia')

    // Legacy divisions routing
    const techMap = new Map<string, string>([['a', 'tech'], ['b', 'tech']])
    assert('Legacy tech routes to bromo', resolveMeetingRoom(['a', 'b'], techMap).roomId === 'bromo')

    const growthMap = new Map<string, string>([['a', 'growth'], ['b', 'growth']])
    assert('Legacy growth routes to semeru', resolveMeetingRoom(['a', 'b'], growthMap).roomId === 'semeru')

    const contentMap = new Map<string, string>([['a', 'content'], ['b', 'content']])
    assert('Legacy content routes to cikurai', resolveMeetingRoom(['a', 'b'], contentMap).roomId === 'cikurai')

    // Mixed non-governance meeting routes to Rinjani (Consejo Contexia)
    const mixedMap = new Map<string, string>([
      ['centinela', 'fiscal'],
      ['pulso', 'finance'],
    ])
    const rMixed = resolveMeetingRoom(['centinela', 'pulso'], mixedMap)
    assert('Mixed non-governance meeting routes to rinjani', rMixed.roomId === 'rinjani')
    assert('rinjani label is Consejo Contexia', rMixed.label === 'Consejo Contexia')

    // Governance meeting > 4 overflows to Rinjani
    const overflowMap = new Map<string, string>([
      ['orchestrator', 'governance'],
      ['centinela', 'fiscal'],
      ['pulso', 'finance'],
      ['social_ops', 'gtm'],
      ['auditoria', 'fiscal'],
    ])
    const rOverflow = resolveMeetingRoom(
      ['orchestrator', 'centinela', 'pulso', 'social_ops', 'auditoria'],
      overflowMap
    )
    assert('Governance meeting > 4 participants overflows to rinjani', rOverflow.roomId === 'rinjani')
  }

  // ---------------------------------------------------------------------------
  // 6. Contexia Room Display Labels & Stable IDs
  // ---------------------------------------------------------------------------
  console.log('\n6. Contexia Room Display Labels & Stable IDs:')
  {
    const expectedLabels: Record<string, { label: string; purpose: string }> = {
      bromo: { label: 'Centinela Fiscal', purpose: 'Fiscal and compliance' },
      semeru: { label: 'Caja Real', purpose: 'Finance and cash' },
      cikurai: { label: 'Ingresos Contexia', purpose: 'GTM and commercial operations' },
      merapi: { label: 'Control Contexia', purpose: 'Governance' },
      rinjani: { label: 'Consejo Contexia', purpose: 'Mixed meetings and capacity overflow' },
      ceo: { label: 'Dirección Contexia', purpose: 'Executive workspace' },
    }

    for (const [id, exp] of Object.entries(expectedLabels)) {
      const entry = CONTEXIA_ROOM_LABELS[id]
      assert(`Label mapping exists for ${id}`, entry !== undefined)
      assert(`${id} label is "${exp.label}"`, entry?.label === exp.label)
      assert(`${id} purpose is "${exp.purpose}"`, entry?.purpose === exp.purpose)
    }

    // Stable IDs check
    const stableIds = Object.keys(CONTEXIA_ROOM_LABELS)
    assert('Stable room IDs count is exactly 6', stableIds.length === 6)
    assert(
      'Stable room IDs match upstream definitions exactly',
      ['bromo', 'semeru', 'cikurai', 'merapi', 'rinjani', 'ceo'].every((id) =>
        stableIds.includes(id)
      )
    )
  }

  // ---------------------------------------------------------------------------
  // 7. Meeting Runtime Participant Strict Check (No Silent Truncation)
  // ---------------------------------------------------------------------------
  console.log('\n7. Meeting Runtime Participant Strict Rejection:')
  {
    let rejected = false
    let errMessage = ''
    try {
      await startMeeting({
        topic: 'Test Cap Meeting',
        participants: ['alice', 'bob', 'charlie', 'david', 'eve'], // 5 participants (> 4)
      })
    } catch (e) {
      rejected = true
      errMessage = (e as Error).message
    }
    assert('startMeeting strictly rejects 5 participants', rejected)
    assert(
      'Error matches Indonesian message format without silent truncation',
      errMessage.includes('jumlah peserta melebihi batas (5 > 4)') &&
        errMessage.includes('batas maksimal rapat adalah 4 peserta')
    )
  }

  console.log(`\nResults: ${checks - failures}/${checks} checks passed.\n`)
  if (failures > 0) {
    console.error(`FAILED: ${failures} check(s) failed.`)
    process.exit(1)
  } else {
    console.log('SUCCESS: All meeting rooms, Merapi seating, and room branding checks passed.')
  }
}

runTests().catch((err) => {
  console.error('Unhandled error during test run:', err)
  process.exit(1)
})
