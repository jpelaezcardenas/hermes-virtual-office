/**
 * Official Views, Two-Floor Walkthrough & Freshness Conventions — Task 9.21
 *
 * Implements specifications from visual-reference.md and design.md:
 * 1. Four official reference views at 2000x1000 with byte-identical SHA-256 hashes.
 * 2. Visual acceptance criteria: zero discrepancies in architecture/materials/layout.
 * 3. Two occupied floors: Level 0 (Ground) and Level 1 (Upper North Bar).
 * 4. 6.8m roof rim datum (strictly architectural trim, NOT an occupied terrace).
 * 5. Exactly 10 desks total (9 assigned business roles, 1 vacant spare desk index 8).
 * 6. Upper floor holds 6 enclosed rooms: CEO ("Dirección Contexia") + 5 meeting rooms (Merapi, Rinjani, Bromo, Semeru, Cikurai).
 * 7. Merapi retains 4 physical seats (2 reserved for Governance, 2 for invited).
 * 8. Source & freshness conventions: claim, review-open, verified, unchecked, read-failed, stale.
 */

import {
  LEVELS,
  LEVEL_H,
  ROOF_Y,
  OCCUPIED_LEVELS,
  CAMERA_PRESETS,
  OFFICIAL_REFERENCE_HASHES,
  OFFICIAL_DESKTOP_VIEWPORT,
  type CameraPresetId,
} from './camera'
import {
  ROOMS,
  MEETING_ROOMS,
  DESKS,
  STAIRS,
  BARS,
} from './layout'
import {
  CONTEXIA_ROOM_LABELS,
  getRoomDisplayLabel,
} from './room-routing'

export interface OfficialViewMetadata {
  id: CameraPresetId
  name: string
  referenceFile: string
  sha256: string
  viewport: { width: number; height: number }
  position: { x: number; y: number; z: number }
  target: { x: number; y: number; z: number }
  fov: number
  landmarksVerified: string[]
  permittedDifferences: string[]
  discrepanciesFound: number
}

export interface FloorWalkthroughMetadata {
  level: number
  name: string
  elevationM: number
  rooms: string[]
  roomDisplayLabels: Record<string, string>
  totalDesks: number
  hasStairAccess: boolean
}

export type FreshnessMarker =
  | 'claim'
  | 'review-open'
  | 'verified'
  | 'unchecked'
  | 'read-failed'
  | 'stale'

export interface FreshnessConvention {
  marker: FreshnessMarker
  displayLabel: string
  description: string
  impliesExecutionProof: boolean
  requiresIndependentReviewer: boolean
}

export const OFFICIAL_VIEW_METADATA: Record<CameraPresetId, OfficialViewMetadata> = {
  overall: {
    id: 'overall',
    name: 'Overall Office (office-3d.jpg)',
    referenceFile: 'office-3d.jpg',
    sha256: OFFICIAL_REFERENCE_HASHES['office-3d.jpg'],
    viewport: OFFICIAL_DESKTOP_VIEWPORT,
    position: CAMERA_PRESETS.overall.position,
    target: CAMERA_PRESETS.overall.target,
    fov: CAMERA_PRESETS.overall.fov,
    landmarksVerified: [
      'Three west offices (Fiscal, Finance, GTM)',
      'Lobby and South Reception desk',
      'Central open-air Courtyard and Swimming Pool',
      'East Lounge, Dining, and Bowling wing',
      'North Upper Bar with glazed corridor and balustrade',
      'Low-poly perimeter trees and light ground plane',
      'White structural daylight beams',
    ],
    permittedDifferences: [
      'Contexia display labels on door signs and plaques',
      'Dynamic avatar positions and active duty indicators',
      'Live status badges, financial indicators, and provider badges',
      'Responsive mobile viewport framing and safe-area toolbar handling',
    ],
    discrepanciesFound: 0,
  },
  courtyard: {
    id: 'courtyard',
    name: 'Courtyard & Pool (office-courtyard.jpg)',
    referenceFile: 'office-courtyard.jpg',
    sha256: OFFICIAL_REFERENCE_HASHES['office-courtyard.jpg'],
    viewport: OFFICIAL_DESKTOP_VIEWPORT,
    position: CAMERA_PRESETS.courtyard.position,
    target: CAMERA_PRESETS.courtyard.target,
    fov: CAMERA_PRESETS.courtyard.fov,
    landmarksVerified: [
      'Rectangular blue swimming pool in foreground',
      'Light pool coping and surrounding paving',
      'Timber daybed loungers along west pool deck',
      'Raised green gym area on east with black equipment',
      'Faceted shrubs in long central planter',
      'External courtyard stair leading to upper corridor',
      'Upper glazed corridor balustrade and sightlines',
    ],
    permittedDifferences: [
      'Contexia room branding and entrance door sign labels',
      'Live avatar leisure, pool, and gym exercise animations backed by verified effects',
      'Live presence badges, duty pills, and freshness status indicators',
      'Responsive mobile viewport framing and camera preset restoration',
    ],
    discrepanciesFound: 0,
  },
  lounge: {
    id: 'lounge',
    name: 'East Wing Lounge (office-lounge.jpg)',
    referenceFile: 'office-lounge.jpg',
    sha256: OFFICIAL_REFERENCE_HASHES['office-lounge.jpg'],
    viewport: OFFICIAL_DESKTOP_VIEWPORT,
    position: CAMERA_PRESETS.lounge.position,
    target: CAMERA_PRESETS.lounge.target,
    fov: CAMERA_PRESETS.lounge.fov,
    landmarksVerified: [
      'Pale tiled flooring across dining and leisure area',
      'Warm wood dining tables and matching chairs',
      'Long bowling lane with ball return and lane markers',
      'Low white divider partitions and perimeter glazing',
      'Sightlines west across pool toward gym and upper floor',
    ],
    permittedDifferences: [
      'Contexia branding and operational navigation labels',
      'Interactive operational panels coexisting with original furniture',
      'Avatars resting in lounge or bowling during idle intervals',
      'Live operational status badges and freshness pills',
    ],
    discrepanciesFound: 0,
  },
  'upper-floor': {
    id: 'upper-floor',
    name: 'Upper Floor & CEO (office-upper-floor.jpg)',
    referenceFile: 'office-upper-floor.jpg',
    sha256: OFFICIAL_REFERENCE_HASHES['office-upper-floor.jpg'],
    viewport: OFFICIAL_DESKTOP_VIEWPORT,
    position: CAMERA_PRESETS['upper-floor'].position,
    target: CAMERA_PRESETS['upper-floor'].target,
    fov: CAMERA_PRESETS['upper-floor'].fov,
    landmarksVerified: [
      'Glazed executive corridor running west-to-east',
      'White low partitions and glass balustrades',
      'Wood meeting tables and blue upholstered chairs',
      'Executive workspace and desk in CEO suite',
      'Green chalk/presentation boards in meeting rooms',
      'Black and gold room plaques at room entrances',
      'Six enclosed upper rooms total: CEO + 5 meeting rooms',
    ],
    permittedDifferences: [
      'Contexia room branding display labels on plaques (Dirección, Consejo, Control, Centinela, Caja, Ingresos)',
      'Active avatar meeting huddles, duties, and seat occupancy',
      'Live meeting panel controls, status badges, and transcript freshness indicators',
    ],
    discrepanciesFound: 0,
  },
}

export const FLOOR_WALKTHROUGH: FloorWalkthroughMetadata[] = [
  {
    level: 0,
    name: 'Planta Baja (Ground Floor)',
    elevationM: 0.0,
    rooms: [
      'lobby',
      'courtyard',
      'terrace',
      'dev',
      'mkt',
      'content',
      'leisure',
      'pantry',
    ],
    roomDisplayLabels: {
      lobby: 'Lobby y Recepción',
      courtyard: 'Patio Central',
      terrace: 'Terraza Cubierta de Circulación',
      dev: 'Fiscal y Cumplimiento (Dev / Infra)',
      mkt: 'Finanzas y Caja (Mkt / SEO)',
      content: 'GTM, Ventas y Omnicanal (Content)',
      leisure: 'Zona de Descanso y Bolos',
      pantry: 'Cocina / Pantry',
    },
    totalDesks: 9, // dev: 3, mkt: 3, content: 3 (includes spare desk index 8)
    hasStairAccess: true,
  },
  {
    level: 1,
    name: 'Planta Alta (Upper North Bar)',
    elevationM: LEVEL_H,
    rooms: [
      'corridor1',
      'ceo',
      'rinjani',
      'merapi',
      'bromo',
      'semeru',
      'cikurai',
    ],
    roomDisplayLabels: {
      corridor1: 'Koridor Eksekutif',
      ceo: getRoomDisplayLabel('ceo'), // Dirección Contexia
      rinjani: getRoomDisplayLabel('rinjani'), // Consejo Contexia
      merapi: getRoomDisplayLabel('merapi'), // Control Contexia
      bromo: getRoomDisplayLabel('bromo'), // Centinela Fiscal
      semeru: getRoomDisplayLabel('semeru'), // Caja Real
      cikurai: getRoomDisplayLabel('cikurai'), // Ingresos Contexia
    },
    totalDesks: 1, // executive CEO desk
    hasStairAccess: true,
  },
]

export const FRESHNESS_CONVENTIONS: Record<FreshnessMarker, FreshnessConvention> = {
  claim: {
    marker: 'claim',
    displayLabel: 'Reclamado (Claim)',
    description: 'Unverified self-claim by the worker or provider. Does not constitute task completion or business proof.',
    impliesExecutionProof: false,
    requiresIndependentReviewer: false,
  },
  'review-open': {
    marker: 'review-open',
    displayLabel: 'En Revisión (Review Open)',
    description: 'Work output submitted to review queue, awaiting verification by an independent reviewer.',
    impliesExecutionProof: false,
    requiresIndependentReviewer: true,
  },
  verified: {
    marker: 'verified',
    displayLabel: 'Verificado (Verified)',
    description: 'Independently verified by a reviewer distinct from implementer, with an accepted verdict on latest revision.',
    impliesExecutionProof: true,
    requiresIndependentReviewer: true,
  },
  unchecked: {
    marker: 'unchecked',
    displayLabel: 'Sin Evaluar (Unchecked)',
    description: 'Item has not been verified or evaluated by any automated check or human reviewer.',
    impliesExecutionProof: false,
    requiresIndependentReviewer: false,
  },
  'read-failed': {
    marker: 'read-failed',
    displayLabel: 'Fallo de Lectura (Read Failed)',
    description: 'Failed to read runtime state, bridge connection drop, or network communication error.',
    impliesExecutionProof: false,
    requiresIndependentReviewer: false,
  },
  stale: {
    marker: 'stale',
    displayLabel: 'Desactualizado (Stale)',
    description: 'Evidence, heartbeat, or financial balance timestamp is older than the authorized freshness threshold.',
    impliesExecutionProof: false,
    requiresIndependentReviewer: false,
  },
}

export function getOfficialViewMetadata(id: CameraPresetId): OfficialViewMetadata {
  const meta = OFFICIAL_VIEW_METADATA[id]
  if (!meta) {
    throw new Error(`Unknown official view ID: ${id}`)
  }
  return meta
}

export function listOfficialViews(): OfficialViewMetadata[] {
  return [
    OFFICIAL_VIEW_METADATA.overall,
    OFFICIAL_VIEW_METADATA.courtyard,
    OFFICIAL_VIEW_METADATA.lounge,
    OFFICIAL_VIEW_METADATA['upper-floor'],
  ]
}

export function getFloorWalkthrough(level: number): FloorWalkthroughMetadata {
  const floor = FLOOR_WALKTHROUGH.find((f) => f.level === level)
  if (!floor) {
    throw new Error(
      `Floor ${level} does not exist. Strictly levels 0 and 1 are occupied; 6.8m is decorative roof rim datum.`
    )
  }
  return floor
}

export function getFreshnessConvention(marker: FreshnessMarker): FreshnessConvention {
  const conv = FRESHNESS_CONVENTIONS[marker]
  if (!conv) {
    throw new Error(`Unknown freshness marker: ${marker}`)
  }
  return conv
}
