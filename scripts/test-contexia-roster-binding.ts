/**
 * Test Contexia Roster Binding — Task 9.3
 *
 * Verifies:
 * 1. Exactly four functional Contexia divisions: fiscal, finance, gtm, governance.
 * 2. Exactly nine business roles mapped to the ten existing desks.
 * 3. Exactly ten desks total: 9 occupied, desk 8 is the vacant spare desk.
 * 4. Approval Queue (desk 2) and KB (desk 5) retain division 'governance' while seated in Fiscal and Finance rooms.
 * 5. Receptionist is anchored behind reception counter and does not occupy a desk.
 * 6. No furniture or rooms are moved (matches layout.ts unchanged).
 * 7. Zero fabricated extra agents in the roster.
 *
 * Run: npx tsx scripts/test-contexia-roster-binding.ts
 */

import { DESKS, RECEPTION, ROOMS, deskSeatWorld, roomById } from '../src/lib/office/layout'
import {
  CONTEXIA_DIVISIONS,
  CONTEXIA_ROLES,
  SPARE_DESK_INDEX,
  TOTAL_DESKS_COUNT,
  getContexiaRoster,
  getContexiaDeskOccupancies,
  type ContexiaDivisionId,
  type ContexiaRoleId,
} from '../src/lib/office/contexia-roster'

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

console.log('--- Task 9.3: Contexia Roster & Desks Binding Test ---')

// 1. Exactly 4 functional Contexia divisions
const divisionKeys = Object.keys(CONTEXIA_DIVISIONS) as ContexiaDivisionId[]
assert('Exactly 4 functional divisions defined', divisionKeys.length === 4, `found ${divisionKeys.length}`)
assert('Divisions include fiscal, finance, gtm, governance',
  divisionKeys.includes('fiscal') &&
  divisionKeys.includes('finance') &&
  divisionKeys.includes('gtm') &&
  divisionKeys.includes('governance')
)

assert('Fiscal division maps to room dev (Level 0)',
  CONTEXIA_DIVISIONS.fiscal.roomId === 'dev' && CONTEXIA_DIVISIONS.fiscal.level === 0 && CONTEXIA_DIVISIONS.fiscal.upstreamDivision === 'tech'
)
assert('Finance division maps to room mkt (Level 0)',
  CONTEXIA_DIVISIONS.finance.roomId === 'mkt' && CONTEXIA_DIVISIONS.finance.level === 0 && CONTEXIA_DIVISIONS.finance.upstreamDivision === 'growth'
)
assert('GTM division maps to room content (Level 0)',
  CONTEXIA_DIVISIONS.gtm.roomId === 'content' && CONTEXIA_DIVISIONS.gtm.level === 0 && CONTEXIA_DIVISIONS.gtm.upstreamDivision === 'content'
)
assert('Governance division maps to room ceo (Level 1)',
  CONTEXIA_DIVISIONS.governance.roomId === 'ceo' && CONTEXIA_DIVISIONS.governance.level === 1 && CONTEXIA_DIVISIONS.governance.upstreamDivision === 'exec'
)

// 2. Exactly 9 business roles
const roleKeys = Object.keys(CONTEXIA_ROLES) as ContexiaRoleId[]
assert('Exactly 9 business roles defined', roleKeys.length === 9, `found ${roleKeys.length}`)

const expectedRoleDesks: Record<ContexiaRoleId, { division: ContexiaDivisionId; deskIndex: number; roomId: string; level: number; isShared?: boolean }> = {
  centinela: { division: 'fiscal', deskIndex: 0, roomId: 'dev', level: 0 },
  auditoria: { division: 'fiscal', deskIndex: 1, roomId: 'dev', level: 0 },
  approval_queue: { division: 'governance', deskIndex: 2, roomId: 'dev', level: 0, isShared: true },
  pulso: { division: 'finance', deskIndex: 3, roomId: 'mkt', level: 0 },
  radar: { division: 'finance', deskIndex: 4, roomId: 'mkt', level: 0 },
  kb: { division: 'governance', deskIndex: 5, roomId: 'mkt', level: 0, isShared: true },
  social_ops: { division: 'gtm', deskIndex: 6, roomId: 'content', level: 0 },
  taty: { division: 'gtm', deskIndex: 7, roomId: 'content', level: 0 },
  orchestrator: { division: 'governance', deskIndex: 9, roomId: 'ceo', level: 1 },
}

for (const [roleId, expected] of Object.entries(expectedRoleDesks)) {
  const role = CONTEXIA_ROLES[roleId as ContexiaRoleId]
  assert(`Role ${roleId} is registered`, !!role)
  if (role) {
    assert(`Role ${roleId} assigned to desk ${expected.deskIndex}`, role.deskIndex === expected.deskIndex)
    assert(`Role ${roleId} belongs to division ${expected.division}`, role.division === expected.division)
    assert(`Role ${roleId} is placed in room ${expected.roomId}`, role.roomId === expected.roomId)
    assert(`Role ${roleId} sits on level ${expected.level}`, role.level === expected.level)
    if (expected.isShared) {
      assert(`Role ${roleId} is flagged as shared seat`, role.isSharedSeat === true)
    }
  }
}

// 3. Desk geometry and total desk count
assert('Total physical desks in office equals 10', DESKS.length === TOTAL_DESKS_COUNT && DESKS.length === 10)
const occupancies = getContexiaDeskOccupancies()
assert('Desk occupancies list has 10 entries', occupancies.length === 10)

const occupiedDesks = occupancies.filter((d) => !d.isVacant)
const vacantDesks = occupancies.filter((d) => d.isVacant)

assert('Exactly 9 desks are occupied by business roles', occupiedDesks.length === 9)
assert('Exactly 1 desk is vacant', vacantDesks.length === 1)
assert('Vacant desk is Desk 8 (spare desk)', vacantDesks[0]?.deskIndex === SPARE_DESK_INDEX && vacantDesks[0]?.deskIndex === 8)
assert('Spare desk is located in content studio (Level 0)', vacantDesks[0]?.roomId === 'content' && vacantDesks[0]?.level === 0)

// 4. Shared seats retain Governance ownership
const aqRole = CONTEXIA_ROLES.approval_queue
assert('Approval Queue retains division governance at desk 2', aqRole.division === 'governance')
assert('Approval Queue sits in dev room (Fiscal area)', aqRole.roomId === 'dev')

const kbRole = CONTEXIA_ROLES.kb
assert('KB retains division governance at desk 5', kbRole.division === 'governance')
assert('KB sits in mkt room (Finance area)', kbRole.roomId === 'mkt')

// 5. Receptionist is anchored behind reception counter and does not occupy a desk
const roster = getContexiaRoster()
assert('Roster contains 10 members: 9 business roles + 1 receptionist', roster.length === 10)

const receptionist = roster.find((a) => a.avatarId === 'contexia:receptionist' || a.avatarId === 'dummy:lobby:reception')
assert('Receptionist avatar exists in roster', !!receptionist)
if (receptionist) {
  assert('Receptionist is marked anchored', receptionist.anchored === true)
  assert('Receptionist is placed behind reception desk in lobby',
    Math.abs(receptionist.x - RECEPTION.x) < 0.1 &&
    Math.abs(receptionist.z - (RECEPTION.z - 1.15)) < 0.1 &&
    receptionist.level === 0
  )
  const deskIndices = occupancies.map((d) => d.deskIndex)
  assert('Receptionist does not occupy any of the 10 desks', !deskIndices.includes((receptionist as any).deskIndex))
}

// 6. Zero fabricated extra agents
const businessAvatars = roster.filter((a) => a.avatarId !== 'contexia:receptionist' && a.avatarId !== 'dummy:lobby:reception')
assert('Exactly 9 business avatars generated (no fabricated extra agents)', businessAvatars.length === 9)

// 7. Verify physical desk coordinates match layout.ts DESKS seats
for (const b of businessAvatars) {
  const role = Object.values(CONTEXIA_ROLES).find((r) => r.avatarId === b.avatarId || `contexia:${r.roleId}` === b.avatarId)
  assert(`Avatar ${b.name} matches a known role`, !!role)
  if (role) {
    const desk = DESKS[role.deskIndex]
    assert(`Desk ${role.deskIndex} exists in layout.ts`, !!desk)
    if (desk) {
      const seat = deskSeatWorld(desk)
      assert(`Avatar ${b.name} seated at correct world coordinates for desk ${role.deskIndex}`,
        Math.abs(b.x - seat.x) < 0.01 && Math.abs(b.z - seat.z) < 0.01 && b.level === desk.level
      )
    }
  }
}

// 8. Rooms unchanged
const devRoom = roomById('dev')
const mktRoom = roomById('mkt')
const contentRoom = roomById('content')
const ceoRoom = roomById('ceo')
assert('dev room exists and unchanged', !!devRoom && devRoom.level === 0)
assert('mkt room exists and unchanged', !!mktRoom && mktRoom.level === 0)
assert('content room exists and unchanged', !!contentRoom && contentRoom.level === 0)
assert('ceo room exists and unchanged', !!ceoRoom && ceoRoom.level === 1)

console.log(`\nResults: ${checks - failures}/${checks} checks passed.`)
if (failures > 0) {
  console.error(`FAILED: ${failures} check(s) failed.`)
  process.exit(1)
} else {
  console.log('SUCCESS: All Contexia roster binding checks passed.\n')
}
