/**
 * polygon-nav.ts — Multilevel navigation mesh, segment-AABB wall collision detection,
 * doorway opening clearance, and stair routing validation.
 *
 * Task 9.7 of bunker-virtual-office OpenSpec change.
 *
 * Invariants:
 * - Exactly two occupied levels: Level 0 (ground floor) and Level 1 (north-bar executive floor).
 * - Roof rim datum 6.8m (LEVELS = 2, LEVEL_H = 3.4) is strictly decorative trim; level >= 2 rejected.
 * - Transitions between Level 0 and Level 1 occur strictly via the external courtyard stair:
 *   must pass through STAIR_FOOT ({ x: -9.3, z: -2.5 }) and STAIR_TOP ({ x: -9.3, z: -10.1 }).
 * - Same-floor path segments must not cut through solid walls.
 * - Clean crossing through doorways (OPENINGS) is validated.
 */

import {
  FOOTPRINTS,
  OPENINGS,
  POOL,
  STAIR_FOOT,
  STAIR_TOP,
  LEVEL_BOUNDS,
  type Footprint,
} from './layout'
import {
  type Level,
  type Waypoint,
  BODY_R,
  CELL,
} from './nav'
import {
  LEVELS,
  LEVEL_H,
  ROOF_Y,
  OCCUPIED_LEVELS,
  isOccupiedLevel,
  validateFloorLevel,
} from './camera'

export {
  LEVELS,
  LEVEL_H,
  ROOF_Y,
  OCCUPIED_LEVELS,
  CELL,
  BODY_R,
  STAIR_FOOT,
  STAIR_TOP,
  isOccupiedLevel,
  validateFloorLevel,
}

export const STAIR_FOOT_WAYPOINT = STAIR_FOOT
export const STAIR_TOP_WAYPOINT = STAIR_TOP

export type SegmentValidationResult = {
  valid: boolean
  reason?: string
  collider?: string
  explanation?: string
}

export type MultilevelRouteValidationResult = {
  valid: boolean
  reason?: string
  collider?: string
  explanation?: string
  segmentIndex?: number
}

/**
 * Segment-AABB intersection detection using the Liang-Barsky / slab algorithm.
 *
 * Given segment (x1, z1) -> (x2, z2) and Footprint box (x, z, hw, hd), test if line
 * intersects box inflated by padding `pad`.
 *
 * Returns `{ hit: boolean; t0: number; t1: number }` where t0, t1 are normalized
 * parametric coordinates along the segment in [0, 1].
 */
export function segmentIntersectsBox(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  box: { x: number; z: number; hw?: number; hd?: number; w?: number; d?: number },
  pad = 0,
): { hit: boolean; t0: number; t1: number } {
  const hw = box.hw ?? (box.w !== undefined ? box.w / 2 : 0)
  const hd = box.hd ?? (box.d !== undefined ? box.d / 2 : 0)

  const minX = box.x - hw - pad
  const maxX = box.x + hw + pad
  const minZ = box.z - hd - pad
  const maxZ = box.z + hd + pad

  const dx = x2 - x1
  const dz = z2 - z1

  let tMin = 0.0
  let tMax = 1.0

  // X slab
  if (Math.abs(dx) < 1e-9) {
    if (x1 < minX || x1 > maxX) return { hit: false, t0: 0, t1: 0 }
  } else {
    const invDx = 1.0 / dx
    let t1 = (minX - x1) * invDx
    let t2 = (maxX - x1) * invDx
    if (t1 > t2) {
      const tmp = t1
      t1 = t2
      t2 = tmp
    }
    tMin = Math.max(tMin, t1)
    tMax = Math.min(tMax, t2)
    if (tMin > tMax) return { hit: false, t0: 0, t1: 0 }
  }

  // Z slab
  if (Math.abs(dz) < 1e-9) {
    if (z1 < minZ || z1 > maxZ) return { hit: false, t0: 0, t1: 0 }
  } else {
    const invDz = 1.0 / dz
    let t1 = (minZ - z1) * invDz
    let t2 = (maxZ - z1) * invDz
    if (t1 > t2) {
      const tmp = t1
      t1 = t2
      t2 = tmp
    }
    tMin = Math.max(tMin, t1)
    tMax = Math.min(tMax, t2)
    if (tMin > tMax) return { hit: false, t0: 0, t1: 0 }
  }

  return { hit: true, t0: Math.max(0.0, tMin), t1: Math.min(1.0, tMax) }
}

/** Alias for segmentIntersectsBox matching AABB terminology. */
export const segmentIntersectsAABB = segmentIntersectsBox

/**
 * Checks if a 2D point lies inside any opening door on the given level.
 */
export function isPointInOpening(
  x: number,
  z: number,
  level: Level,
  pad = 0.05,
): boolean {
  return OPENINGS.some(
    (o) =>
      o.level === level &&
      Math.abs(x - o.x) <= o.hw - pad + 0.1 &&
      Math.abs(z - o.z) <= o.hd + 0.65,
  )
}

/**
 * Checks if a segment cleanly crosses through an opening door on the given level.
 */
export function isSegmentInOpening(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  level: Level,
): boolean {
  for (const o of OPENINGS) {
    if (o.level !== level) continue
    const hit = segmentIntersectsBox(
      x1,
      z1,
      x2,
      z2,
      { x: o.x, z: o.z, hw: o.hw, hd: o.hd + 0.6 },
      0,
    )
    if (hit.hit) {
      return true
    }
  }
  return false
}

/**
 * Verifies if all intersection points between a segment and a wall box fall inside
 * a designated opening door.
 */
export function isWallCrossingCoveredByOpening(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  t0: number,
  t1: number,
  level: Level,
): boolean {
  const sampleT = [t0, (t0 + t1) / 2.0, t1]
  for (const o of OPENINGS) {
    if (o.level !== level) continue
    const allIn = sampleT.every((t) => {
      const px = x1 + t * (x2 - x1)
      const pz = z1 + t * (z2 - z1)
      return (
        Math.abs(px - o.x) <= o.hw + 0.15 && Math.abs(pz - o.z) <= o.hd + 0.65
      )
    })
    if (allIn) return true
  }
  return false
}

/**
 * Validates a single path segment against walls on the given level.
 * Returns `{ valid: boolean; reason?: string; collider?: string; explanation?: string }`.
 */
export function validatePathSegment(
  from: { x: number; z: number },
  to: { x: number; z: number },
  level: Level,
  pad = 0.0,
): SegmentValidationResult {
  const walls = FOOTPRINTS.filter((f) => f.kind === 'wall' && f.level === level)

  for (const w of walls) {
    const hit = segmentIntersectsBox(from.x, from.z, to.x, to.z, w, pad)
    if (hit.hit) {
      // Check if crossing is through an opening door
      if (
        isWallCrossingCoveredByOpening(
          from.x,
          from.z,
          to.x,
          to.z,
          hit.t0,
          hit.t1,
          level,
        )
      ) {
        continue
      }
      return {
        valid: false,
        reason: 'cut_through_wall',
        collider: w.id || 'wall',
        explanation: `Path segment from (${from.x.toFixed(2)}, ${from.z.toFixed(2)}) to (${to.x.toFixed(2)}, ${to.z.toFixed(2)}) cuts through wall ${w.id || 'wall'} on level ${level}`,
      }
    }
  }

  return { valid: true }
}

/**
 * Checks if a segment intersects the solid courtyard swimming pool.
 */
export function segmentIntersectsPool(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  pad = 0.0,
): boolean {
  const hw = POOL.w / 2
  const hd = POOL.d / 2
  const hit = segmentIntersectsBox(
    x1,
    z1,
    x2,
    z2,
    { x: POOL.x, z: POOL.z, hw, hd },
    pad,
  )
  return hit.hit
}

/**
 * Validates a multilevel route:
 * 1. Validates that every waypoint is on an occupied level (0 or 1).
 *    Rejects level >= 2 with roof rim datum explanation, and rejects negative levels.
 * 2. Validates that consecutive waypoints on the same level do not cut through solid walls.
 * 3. Validates that transitions between Level 0 and Level 1 occur strictly via the
 *    external courtyard stair: must pass through STAIR_FOOT ({x: -9.3, z: -2.5}) and
 *    STAIR_TOP ({x: -9.3, z: -10.1}). Teleporting between floors anywhere else is strictly rejected.
 */
export function validateMultilevelRoute(
  waypoints: Array<{ x: number; z: number; level: number }>,
): MultilevelRouteValidationResult {
  if (!waypoints || waypoints.length === 0) {
    return { valid: true }
  }

  // 1. Level Boundary Verification
  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i]
    const lvl = wp.level
    if (lvl === 2) {
      return {
        valid: false,
        reason: 'invalid_level_boundary',
        explanation:
          'Level 2 does not exist as an occupied floor; 6.8m datum is strictly a decorative roof rim trim.',
        segmentIndex: i,
      }
    }
    if (lvl > 2) {
      return {
        valid: false,
        reason: 'invalid_level_boundary',
        explanation: `Level ${lvl} does not exist. The building strictly has two occupied levels (0 and 1); no terrace or tower.`,
        segmentIndex: i,
      }
    }
    if (lvl < 0) {
      return {
        valid: false,
        reason: 'invalid_level_boundary',
        explanation:
          'Negative levels are not supported. Only levels 0 and 1 are occupied.',
        segmentIndex: i,
      }
    }
    if (!isOccupiedLevel(lvl)) {
      return {
        valid: false,
        reason: 'invalid_level_boundary',
        explanation: 'Only levels 0 and 1 are valid occupied levels.',
        segmentIndex: i,
      }
    }
  }

  // 2. Consecutive Waypoints & Inter-Floor Transitions Check
  const tol = 0.55 // Tolerance for reaching stair waypoints

  for (let i = 0; i < waypoints.length - 1; i++) {
    const prev = waypoints[i]
    const curr = waypoints[i + 1]

    if (prev.level !== curr.level) {
      // Inter-floor transition: must occur strictly at the stair
      let isStairTransition = false

      // UP: Level 0 -> Level 1
      if (prev.level === 0 && curr.level === 1) {
        const atFoot =
          Math.hypot(prev.x - STAIR_FOOT.x, prev.z - STAIR_FOOT.z) <= tol
        const atTop =
          Math.hypot(curr.x - STAIR_TOP.x, curr.z - STAIR_TOP.z) <= tol
        if (atFoot && atTop) {
          isStairTransition = true
        }
      }
      // DOWN: Level 1 -> Level 0
      else if (prev.level === 1 && curr.level === 0) {
        const atTopPrev =
          Math.hypot(prev.x - STAIR_TOP.x, prev.z - STAIR_TOP.z) <= tol
        const atTopCurr =
          Math.hypot(curr.x - STAIR_TOP.x, curr.z - STAIR_TOP.z) <= tol
        const atFootCurr =
          Math.hypot(curr.x - STAIR_FOOT.x, curr.z - STAIR_FOOT.z) <= tol

        if (atTopPrev && (atTopCurr || atFootCurr)) {
          isStairTransition = true
        }
      }

      if (!isStairTransition) {
        return {
          valid: false,
          reason: 'inter_floor_transition_without_stair',
          explanation: `Transitions between Level 0 and Level 1 occur strictly via the external courtyard stair: must pass through STAIR_FOOT (${STAIR_FOOT.x}, ${STAIR_FOOT.z}) and STAIR_TOP (${STAIR_TOP.x}, ${STAIR_TOP.z}). Teleporting between floors anywhere else is strictly rejected.`,
          segmentIndex: i,
        }
      }
    } else {
      // Same level: test for wall collisions
      const segRes = validatePathSegment(prev, curr, prev.level as Level, 0.0)
      if (!segRes.valid) {
        return {
          valid: false,
          reason: segRes.reason || 'cut_through_wall',
          collider: segRes.collider,
          explanation: segRes.explanation,
          segmentIndex: i,
        }
      }
    }
  }

  return { valid: true }
}
