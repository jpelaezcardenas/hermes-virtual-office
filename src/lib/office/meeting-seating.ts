/**
 * Meeting Rooms, Merapi Seating Policy, and Contexia Room Branding (Task 9.5)
 *
 * Implements:
 * - 4 physical seats in Merapi (Control Contexia):
 *   * 2 reserved for Governance (seatIndex 0, 1)
 *   * 2 for invited participants (seatIndex 2, 3)
 * - Deterministic seating allocation for Merapi.
 * - Rejection when participants > 4 or invited participants > 2.
 * - Deterministic meeting room routing by division and capacity.
 * - Contexia display personalization:
 *   * bromo -> Centinela Fiscal (Fiscal and compliance)
 *   * semeru -> Caja Real (Finance and cash)
 *   * cikurai -> Ingresos Contexia (GTM and commercial operations)
 *   * merapi -> Control Contexia (Governance)
 *   * rinjani -> Consejo Contexia (Mixed meetings and capacity overflow)
 *   * ceo -> Dirección Contexia (Executive workspace)
 */

export const MERAPI_SEAT_COUNT = 4
export const MERAPI_GOVERNANCE_RESERVED = 2
export const MERAPI_INVITED_CAPACITY = 2

export const CONTEXIA_ROOM_LABELS: Record<string, { label: string; purpose: string }> = {
  bromo: { label: 'Centinela Fiscal', purpose: 'Fiscal and compliance' },
  semeru: { label: 'Caja Real', purpose: 'Finance and cash' },
  cikurai: { label: 'Ingresos Contexia', purpose: 'GTM and commercial operations' },
  merapi: { label: 'Control Contexia', purpose: 'Governance' },
  rinjani: { label: 'Consejo Contexia', purpose: 'Mixed meetings and capacity overflow' },
  ceo: { label: 'Dirección Contexia', purpose: 'Executive workspace' },
}

export const DIVISION_ROOM_MAP: Record<string, string> = {
  fiscal: 'bromo',
  tech: 'bromo',
  finance: 'semeru',
  growth: 'semeru',
  gtm: 'cikurai',
  content: 'cikurai',
  governance: 'merapi',
  exec: 'merapi',
}

export type MerapiSeatAssignment = {
  participant: string
  seatIndex: number
  isReservedGovernance: boolean
}

/**
 * Allocates seats in Merapi (Control Contexia):
 * - Governance members get reserved seats [0, 1] first (isReservedGovernance: true).
 * - Invited (non-governance) members get invited seats [2, 3] (isReservedGovernance: false).
 * - If participants count > 4: throws Error ("Merapi capacity is 4 seats").
 * - If invited participants > 2 when governance seats reserved: throws Error ("Merapi invited capacity is 2 seats").
 */
export function allocateMerapiSeats(
  participants: { name: string; division: string }[]
): MerapiSeatAssignment[] {
  if (participants.length > MERAPI_SEAT_COUNT) {
    throw new Error(`Merapi capacity is 4 seats (got ${participants.length})`)
  }

  const isGov = (d: string) => {
    const norm = d.trim().toLowerCase()
    return norm === 'governance' || norm === 'exec'
  }

  const gov = participants.filter((p) => isGov(p.division))
  const invited = participants.filter((p) => !isGov(p.division))

  if (invited.length > MERAPI_INVITED_CAPACITY) {
    throw new Error(
      `Merapi invited capacity is 2 seats (got ${invited.length} invited participants)`
    )
  }

  const result: MerapiSeatAssignment[] = []

  // 1. Reserved governance seats [0, 1]
  for (let i = 0; i < Math.min(gov.length, MERAPI_GOVERNANCE_RESERVED); i++) {
    result.push({
      participant: gov[i].name,
      seatIndex: i,
      isReservedGovernance: true,
    })
  }

  // 2. Invited seats [2, 3]
  for (let i = 0; i < invited.length; i++) {
    result.push({
      participant: invited[i].name,
      seatIndex: 2 + i,
      isReservedGovernance: false,
    })
  }

  // 3. Extra governance beyond 2 take remaining available seats
  if (gov.length > MERAPI_GOVERNANCE_RESERVED) {
    for (let i = MERAPI_GOVERNANCE_RESERVED; i < gov.length; i++) {
      const seatIndex = 2 + invited.length + (i - MERAPI_GOVERNANCE_RESERVED)
      result.push({
        participant: gov[i].name,
        seatIndex,
        isReservedGovernance: false,
      })
    }
  }

  return result
}

/**
 * Deterministically resolves meeting room based on participants and divisions:
 * - Maps Contexia divisions (fiscal -> bromo, finance -> semeru, gtm -> cikurai, governance -> merapi)
 *   as well as legacy divisions (tech -> bromo, growth -> semeru, content -> cikurai, exec -> merapi).
 * - If participants.length <= 4 and has governance/exec -> merapi.
 * - If single division -> that division's room.
 * - Otherwise -> rinjani (Consejo Contexia).
 */
export function resolveMeetingRoom(
  participants: string[],
  divisions: Map<string, string>
): { roomId: string; label: string } {
  if (!participants || participants.length === 0) {
    return { roomId: 'rinjani', label: CONTEXIA_ROOM_LABELS.rinjani.label }
  }

  const participantDivisions = participants.map((p) =>
    (divisions.get(p) ?? 'tech').trim().toLowerCase()
  )
  const hasGov = participantDivisions.some((d) => d === 'governance' || d === 'exec')

  // Rule 1: participants.length <= 4 and has governance/exec -> merapi
  if (participants.length <= 4 && hasGov) {
    return { roomId: 'merapi', label: CONTEXIA_ROOM_LABELS.merapi.label }
  }

  // Rule 2: single division -> that division's room
  const uniqueDivs = new Set(participantDivisions)
  if (uniqueDivs.size === 1) {
    const singleDiv = [...uniqueDivs][0]
    // If governance/exec with > 4 participants -> overflow to rinjani
    if ((singleDiv === 'governance' || singleDiv === 'exec') && participants.length > 4) {
      return { roomId: 'rinjani', label: CONTEXIA_ROOM_LABELS.rinjani.label }
    }
    const targetRoom = DIVISION_ROOM_MAP[singleDiv]
    if (targetRoom && CONTEXIA_ROOM_LABELS[targetRoom]) {
      return { roomId: targetRoom, label: CONTEXIA_ROOM_LABELS[targetRoom].label }
    }
  }

  // Rule 3: otherwise -> rinjani (Consejo Contexia)
  return { roomId: 'rinjani', label: CONTEXIA_ROOM_LABELS.rinjani.label }
}
