/**
 * Business-Division Room Routing, Room Capacity, and CEO-Rank Navigation (Task 9.20)
 *
 * Implements:
 * - Deterministic meeting room routing by business division and available seats:
 *   * Fiscal ('fiscal') -> 'bromo' ("Centinela Fiscal")
 *   * Finance ('finance') -> 'semeru' ("Caja Real")
 *   * GTM ('gtm') -> 'cikurai' ("Ingresos Contexia")
 *   * Governance ('governance') -> 'merapi' ("Control Contexia") (4 seats, 2 reserved for Governance, 2 for invited)
 *   * Mixed divisions -> 'rinjani' ("Consejo Contexia")
 *   * Single division > 3 participants (e.g. 4 fiscal participants) -> overflows to 'rinjani'
 *   * Runtime participant cap = 4; exceeding throws participant_cap_exceeded
 *   * Missing division fails closed with unresolved_division (never silently Fiscal!)
 *   * Shared ground-floor Governance desks (Approval Queue, KB) do not alter meeting routing (Governance still routes to Merapi).
 * - CEO-room navigation barrier:
 *   * Only avatars with role in ('ceo', 'manager') can enter CEO suite.
 *   * Staff avatars cannot enter CEO suite (stopped outside doorway).
 * - Deskless peer handling:
 *   * A2A peer without physical desk (deskIndex is null) cancels only visual trip.
 * - Contexia room branding display labels:
 *   * bromo -> Centinela Fiscal
 *   * semeru -> Caja Real
 *   * cikurai -> Ingresos Contexia
 *   * merapi -> Control Contexia
 *   * rinjani -> Consejo Contexia
 *   * ceo -> Dirección Contexia
 */

import type { AgentDivision } from '@/types/hermes'

export type MeetingRoomId = 'rinjani' | 'merapi' | 'bromo' | 'semeru' | 'cikurai'

export type ContexiaRoomId = 'bromo' | 'semeru' | 'cikurai' | 'merapi' | 'rinjani' | 'ceo'

export type ContexiaRoomDetail = {
  id: ContexiaRoomId
  label: string
  purpose: string
  capacity: number
  reservedGovernanceSeats: number
  requiresCeoRank: boolean
}

export const CONTEXIA_ROOM_LABELS: Record<string, { label: string; purpose: string }> = {
  bromo: { label: 'Centinela Fiscal', purpose: 'Fiscal and compliance' },
  semeru: { label: 'Caja Real', purpose: 'Finance and cash' },
  cikurai: { label: 'Ingresos Contexia', purpose: 'GTM and commercial operations' },
  merapi: { label: 'Control Contexia', purpose: 'Governance' },
  rinjani: { label: 'Consejo Contexia', purpose: 'Mixed meetings and capacity overflow' },
  ceo: { label: 'Dirección Contexia', purpose: 'Executive workspace' },
}

export const CONTEXIA_ROOM_DETAILS: Record<ContexiaRoomId, ContexiaRoomDetail> = {
  bromo: {
    id: 'bromo',
    label: 'Centinela Fiscal',
    purpose: 'Fiscal and compliance',
    capacity: 3,
    reservedGovernanceSeats: 0,
    requiresCeoRank: false,
  },
  semeru: {
    id: 'semeru',
    label: 'Caja Real',
    purpose: 'Finance and cash',
    capacity: 3,
    reservedGovernanceSeats: 0,
    requiresCeoRank: false,
  },
  cikurai: {
    id: 'cikurai',
    label: 'Ingresos Contexia',
    purpose: 'GTM and commercial operations',
    capacity: 3,
    reservedGovernanceSeats: 0,
    requiresCeoRank: false,
  },
  merapi: {
    id: 'merapi',
    label: 'Control Contexia',
    purpose: 'Governance',
    capacity: 4,
    reservedGovernanceSeats: 2,
    requiresCeoRank: false,
  },
  rinjani: {
    id: 'rinjani',
    label: 'Consejo Contexia',
    purpose: 'Mixed meetings and capacity overflow',
    capacity: 10,
    reservedGovernanceSeats: 0,
    requiresCeoRank: false,
  },
  ceo: {
    id: 'ceo',
    label: 'Dirección Contexia',
    purpose: 'Executive workspace',
    capacity: 1,
    reservedGovernanceSeats: 0,
    requiresCeoRank: true,
  },
}

export const DIVISION_ROOM_MAP: Record<string, MeetingRoomId> = {
  fiscal: 'bromo',
  tech: 'bromo',
  finance: 'semeru',
  growth: 'semeru',
  gtm: 'cikurai',
  content: 'cikurai',
  governance: 'merapi',
  exec: 'merapi',
}

const GOVERNANCE_DIVISIONS = new Set(['governance', 'exec'])

/**
 * Returns confirmed Contexia display label for any room ID.
 * Stable room IDs and anchors remain unchanged.
 */
export function getRoomDisplayLabel(roomId: string): string {
  if (roomId in CONTEXIA_ROOM_LABELS) {
    return CONTEXIA_ROOM_LABELS[roomId].label
  }
  return roomId
}

/**
 * Check whether an avatar role is permitted to enter the CEO room.
 * Invariant: Staff cannot enter CEO suite (blocked at door). Only CEO and Managers allowed.
 */
export function canEnterCeoRoom(role: string): boolean {
  if (!role) return false
  const norm = role.trim().toLowerCase()
  return norm === 'ceo' || norm === 'manager'
}

/**
 * Check whether an A2A peer has no physical desk and must cancel its visual trip.
 * Invariant: Peer without desk cancels visual trip only; underlying conversation remains truthful.
 */
export function shouldCancelVisualTrip(peer?: { deskIndex?: number | null } | null): boolean {
  if (!peer) return true
  return peer.deskIndex === null || peer.deskIndex === undefined
}

/**
 * Deterministically resolves the meeting room from participant list and their divisions.
 *
 * Invariants:
 * - Fiscal -> bromo ("Centinela Fiscal")
 * - Finance -> semeru ("Caja Real")
 * - GTM -> cikurai ("Ingresos Contexia")
 * - Governance -> merapi ("Control Contexia") (2 reserved for governance, 2 for invited)
 * - Shared governance desks do not alter routing (governance still routes to Merapi).
 * - Mixed non-governance -> rinjani ("Consejo Contexia")
 * - Same-division overflow > 3 participants -> rinjani
 * - Runtime cap 4: participants > 4 throws error
 * - Missing or empty division throws unresolved_division (NEVER silently Fiscal!)
 */
export function meetingRoomFor(
  participants: string[],
  divisions: Map<string, string | AgentDivision> | Record<string, string | AgentDivision>
): MeetingRoomId {
  if (!participants || participants.length === 0) {
    return 'rinjani'
  }

  if (participants.length > 4) {
    throw new Error(
      `participant_cap_exceeded: maximum runtime participants is 4 (got ${participants.length})`
    )
  }

  const lookupDivision = (p: string): string | undefined => {
    if (divisions instanceof Map) {
      return divisions.get(p)
    }
    return (divisions as Record<string, string | AgentDivision>)[p]
  }

  const participantDivisions: string[] = []
  for (const p of participants) {
    const rawDiv = lookupDivision(p)
    if (rawDiv === undefined || rawDiv === null || typeof rawDiv !== 'string' || !rawDiv.trim()) {
      throw new Error(`unresolved_division: missing division for participant "${p}"`)
    }
    const norm = rawDiv.trim().toLowerCase()
    if (!DIVISION_ROOM_MAP[norm]) {
      throw new Error(`unresolved_division: unrecognized division "${norm}" for participant "${p}"`)
    }
    participantDivisions.push(norm)
  }

  const uniqueDivs = new Set(participantDivisions)
  const hasGov = participantDivisions.some((d) => GOVERNANCE_DIVISIONS.has(d))

  // Case 1: Single division
  if (uniqueDivs.size === 1) {
    const singleDiv = participantDivisions[0]
    if (GOVERNANCE_DIVISIONS.has(singleDiv)) {
      return 'merapi'
    }
    if (participants.length > 3) {
      // Overflows to Rinjani (Bromo, Semeru, Cikurai have 3 seats)
      return 'rinjani'
    }
    return DIVISION_ROOM_MAP[singleDiv]
  }

  // Case 2: Mixed with Governance
  if (hasGov && participants.length <= 4) {
    const invitedCount = participantDivisions.filter((d) => !GOVERNANCE_DIVISIONS.has(d)).length
    if (invitedCount <= 2) {
      return 'merapi'
    }
    return 'rinjani'
  }

  // Case 3: Other mixed
  return 'rinjani'
}
