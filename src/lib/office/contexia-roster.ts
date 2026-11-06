/**
 * Contexia Roster & Division Bindings (Task 9.3)
 *
 * Implements:
 * - Four functional Contexia divisions: fiscal, finance, gtm, governance.
 * - Nine unique business roles mapped across the 10 existing desks.
 * - Governance shared seats: Approval Queue (desk 2) and KB (desk 5) retain Governance division ownership
 *   while physically seated in Fiscal (dev) and Finance (mkt) rooms.
 * - Spare desk: desk 8 is explicitly identified as SPARE_DESK_INDEX = 8, is_vacant = true.
 * - Lobby receptionist: anchored behind reception counter, does not occupy any desk.
 * - Preserves all 10 desk positions and room definitions from layout.ts without moving rooms or furniture.
 */

import { DESKS, RECEPTION, deskSeatWorld, type Desk } from './layout'
import type { AgentDivision } from '@/types/hermes'
import type { DummySpec } from './db'

export type ContexiaDivisionId = 'fiscal' | 'finance' | 'gtm' | 'governance'

export type ContexiaDivision = {
  id: ContexiaDivisionId
  name: string
  displayLabelEs: string
  roomId: string
  level: 0 | 1
  upstreamDivision: AgentDivision
}

export const CONTEXIA_DIVISIONS: Record<ContexiaDivisionId, ContexiaDivision> = {
  fiscal: {
    id: 'fiscal',
    name: 'Fiscal and Compliance',
    displayLabelEs: 'Fiscal y Cumplimiento',
    roomId: 'dev',
    level: 0,
    upstreamDivision: 'tech',
  },
  finance: {
    id: 'finance',
    name: 'Finance and Cash',
    displayLabelEs: 'Finanzas y Caja',
    roomId: 'mkt',
    level: 0,
    upstreamDivision: 'growth',
  },
  gtm: {
    id: 'gtm',
    name: 'GTM, Sales and Omnichannel',
    displayLabelEs: 'GTM y Ventas',
    roomId: 'content',
    level: 0,
    upstreamDivision: 'content',
  },
  governance: {
    id: 'governance',
    name: 'Governance Headquarters',
    displayLabelEs: 'Gobernanza',
    roomId: 'ceo',
    level: 1,
    upstreamDivision: 'exec',
  },
}

export type ContexiaRoleId =
  | 'centinela'
  | 'auditoria'
  | 'approval_queue'
  | 'pulso'
  | 'radar'
  | 'kb'
  | 'social_ops'
  | 'taty'
  | 'orchestrator'

export type ContexiaRoleConfig = {
  roleId: ContexiaRoleId
  name: string
  division: ContexiaDivisionId
  deskIndex: number
  roomId: string
  seatRole: 'manager' | 'staff'
  level: 0 | 1
  upstreamDivision: AgentDivision
  isSharedSeat?: boolean
  avatarId: string
}

export const CONTEXIA_ROLES: Record<ContexiaRoleId, ContexiaRoleConfig> = {
  centinela: {
    roleId: 'centinela',
    name: 'Centinela',
    division: 'fiscal',
    deskIndex: 0,
    roomId: 'dev',
    seatRole: 'manager',
    level: 0,
    upstreamDivision: 'tech',
    isSharedSeat: false,
    avatarId: 'contexia:centinela',
  },
  auditoria: {
    roleId: 'auditoria',
    name: 'Auditoría',
    division: 'fiscal',
    deskIndex: 1,
    roomId: 'dev',
    seatRole: 'staff',
    level: 0,
    upstreamDivision: 'tech',
    isSharedSeat: false,
    avatarId: 'contexia:auditoria',
  },
  approval_queue: {
    roleId: 'approval_queue',
    name: 'Approval Queue',
    division: 'governance', // Retains Governance division ownership at shared seat!
    deskIndex: 2,
    roomId: 'dev',
    seatRole: 'staff',
    level: 0,
    upstreamDivision: 'exec',
    isSharedSeat: true,
    avatarId: 'contexia:approval_queue',
  },
  pulso: {
    roleId: 'pulso',
    name: 'Pulso',
    division: 'finance',
    deskIndex: 3,
    roomId: 'mkt',
    seatRole: 'manager',
    level: 0,
    upstreamDivision: 'growth',
    isSharedSeat: false,
    avatarId: 'contexia:pulso',
  },
  radar: {
    roleId: 'radar',
    name: 'Radar',
    division: 'finance',
    deskIndex: 4,
    roomId: 'mkt',
    seatRole: 'staff',
    level: 0,
    upstreamDivision: 'growth',
    isSharedSeat: false,
    avatarId: 'contexia:radar',
  },
  kb: {
    roleId: 'kb',
    name: 'KB',
    division: 'governance', // Retains Governance division ownership at shared seat!
    deskIndex: 5,
    roomId: 'mkt',
    seatRole: 'staff',
    level: 0,
    upstreamDivision: 'exec',
    isSharedSeat: true,
    avatarId: 'contexia:kb',
  },
  social_ops: {
    roleId: 'social_ops',
    name: 'Social Ops',
    division: 'gtm',
    deskIndex: 6,
    roomId: 'content',
    seatRole: 'manager',
    level: 0,
    upstreamDivision: 'content',
    isSharedSeat: false,
    avatarId: 'contexia:social_ops',
  },
  taty: {
    roleId: 'taty',
    name: 'Taty',
    division: 'gtm',
    deskIndex: 7,
    roomId: 'content',
    seatRole: 'staff',
    level: 0,
    upstreamDivision: 'content',
    isSharedSeat: false,
    avatarId: 'contexia:taty',
  },
  orchestrator: {
    roleId: 'orchestrator',
    name: 'Orchestrator',
    division: 'governance',
    deskIndex: 9,
    roomId: 'ceo',
    seatRole: 'manager',
    level: 1,
    upstreamDivision: 'exec',
    isSharedSeat: false,
    avatarId: 'contexia:orchestrator',
  },
}

export const SPARE_DESK_INDEX = 8
export const TOTAL_DESKS_COUNT = 10

export type ContexiaDeskOccupancy = {
  deskIndex: number
  roomId: string
  level: number
  isVacant: boolean
  isSpare: boolean
  roleId: ContexiaRoleId | null
  divisionId: ContexiaDivisionId | null
}

const DESK_ROOM_MAP: Record<number, { roomId: string; level: number }> = {
  0: { roomId: 'dev', level: 0 },
  1: { roomId: 'dev', level: 0 },
  2: { roomId: 'dev', level: 0 },
  3: { roomId: 'mkt', level: 0 },
  4: { roomId: 'mkt', level: 0 },
  5: { roomId: 'mkt', level: 0 },
  6: { roomId: 'content', level: 0 },
  7: { roomId: 'content', level: 0 },
  8: { roomId: 'content', level: 0 },
  9: { roomId: 'ceo', level: 1 },
}

/**
 * Returns occupancy state for all 10 desks.
 */
export function getContexiaDeskOccupancies(): ContexiaDeskOccupancy[] {
  const roleByDesk = new Map<number, ContexiaRoleConfig>()
  for (const role of Object.values(CONTEXIA_ROLES)) {
    roleByDesk.set(role.deskIndex, role)
  }

  const occupancies: ContexiaDeskOccupancy[] = []
  for (let i = 0; i < TOTAL_DESKS_COUNT; i++) {
    const meta = DESK_ROOM_MAP[i] ?? { roomId: 'unknown', level: 0 }
    const role = roleByDesk.get(i)
    const isSpare = i === SPARE_DESK_INDEX

    if (role) {
      occupancies.push({
        deskIndex: i,
        roomId: role.roomId,
        level: role.level,
        isVacant: false,
        isSpare,
        roleId: role.roleId,
        divisionId: role.division,
      })
    } else {
      occupancies.push({
        deskIndex: i,
        roomId: meta.roomId,
        level: meta.level,
        isVacant: true,
        isSpare,
        roleId: null,
        divisionId: null,
      })
    }
  }

  return occupancies
}

/**
 * Returns the Contexia roster: 9 unique business roles placed at their exact desks,
 * plus 1 receptionist anchored behind the counter.
 * Desk 8 remains vacant (spare desk).
 * Total avatars returned = 10 (9 business roles + 1 receptionist). Zero fabricated extra agents.
 */
export function getContexiaRoster(): DummySpec[] {
  const roster: DummySpec[] = []

  // 1. Add the 9 business roles at their desks
  for (const role of Object.values(CONTEXIA_ROLES)) {
    const desk: Desk | undefined = DESKS[role.deskIndex]
    if (!desk) continue

    const seat = deskSeatWorld(desk)
    roster.push({
      avatarId: role.avatarId,
      name: role.name,
      division: role.upstreamDivision, // Upstream layout/avatar compatibility
      x: seat.x,
      z: seat.z,
      level: role.level,
      activity: 'typing',
      facing: seat.facing,
      anchored: false,
    })
  }

  // 2. Add the anchored receptionist behind the lobby counter
  roster.push({
    avatarId: 'contexia:receptionist',
    name: 'Resepsionis',
    division: 'exec',
    x: RECEPTION.x,
    z: RECEPTION.z - 1.15,
    level: 0,
    activity: 'typing',
    facing: 0,
    anchored: true,
  })

  return roster
}
