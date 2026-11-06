/**
 * Test Props, Materials Preservation, and Zero Idle Inference — Task 9.4
 *
 * Verifies:
 * 1. Props preservation:
 *    - Pool: rectangular blue pool, light coping, solid water surface, loungers.
 *    - Gym: raised gym mat, barbell rack, dumbbell rack, pull-up rig, bench press.
 *    - Bowling: bowling lane, ten pins, ball return.
 *    - Lounge: pale tiles, wood tables, chairs, low white partitions.
 *    - Planting: long planter with 9 shrubs, corner plants.
 * 2. White daylight materials and soft daylight shadows:
 *    - marbleLight (glossy light marble), woodWarm (warm wood texture), glassReal (physical glass).
 *    - Daylight sun (castShadow=true, mapSize 2048x2048, radius 4), sky hemisphere fill in lights.ts.
 * 3. Static audit:
 *    - Render/animation modules (scene.ts, build.ts, anim.ts, avatar.ts, materials.ts,
 *      contexia-roster.ts, dummy-roster.ts, facing.ts, nav.ts, layout.ts)
 *      contain no imports or invocations of chat bridges, LLM endpoints, or task dispatch methods.
 * 4. Runtime simulation:
 *    - Running 100 idle animation frames / ticks generates strictly 0 model calls,
 *      0 network mutations, and 0 task claims.
 *
 * Run: npx tsx scripts/test-props-materials-and-idle-inference.ts
 */

import fs from 'fs'
import path from 'path'
import * as THREE from 'three'

import {
  POOL,
  WATER_Y,
  SUNBEDS,
  POOL_LOUNGERS,
  GYM,
  BOWLING,
  PIN_OFFSETS,
  PIN_R,
  PIN_H,
  BALL_R,
  LOUNGE,
  LOUNGE_TABLE,
  LOUNGE_TV,
  DINING_SETS,
  diningChairs,
  PLANTING,
  GARDEN_BEDS,
} from '../src/lib/office/layout'
import { setupLights } from '../src/lib/office/lights'
import * as mats from '../src/lib/office/materials'
import { buildAvatar, type Avatar } from '../src/lib/office/avatar'
import { animate, type AnimAgent, type Activity } from '../src/lib/office/anim'
import { getContexiaRoster } from '../src/lib/office/contexia-roster'
import type { AgentRole } from '../src/types/hermes'

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

console.log('\n--- Task 9.4: Props, Materials & Zero Idle Inference Tests ---\n')

// ===========================================================================
// 1. Props Preservation Checks
// ===========================================================================
console.log('1. Props Preservation:')

// Pool
assert('Pool dimensions are 12m wide x 7m deep', POOL.w === 12.0 && POOL.d === 7.0)
assert('Pool center is at (0, 4.0)', POOL.x === 0 && POOL.z === 4.0)
assert('Pool water level WATER_Y is -0.01 (POOL.waterY - 0.06)', Math.abs(WATER_Y - (-0.01)) < 1e-4)
assert('Three poolside daybeds (loungers) exist', SUNBEDS.length === 3 && POOL_LOUNGERS.length === 3)
assert('All daybeds are placed west of the pool facing east across water',
  SUNBEDS.every((bed) => bed.x < POOL.x - POOL.w / 2 && Math.abs(bed.facing - Math.PI / 2) < 1e-4)
)

// Gym
assert('Gym mat bounds are x: -6.5..6.5, z: -9.0..-2.4',
  GYM.x1 === -6.5 && GYM.x2 === 6.5 && GYM.z1 === -9.0 && GYM.z2 === -2.4
)
assert('Barbell rack is at (-4.2, -5.6) with bench top 0.52 and bar height 1.32',
  GYM.rack.x === -4.2 && GYM.rack.z === -5.6 && GYM.rack.benchTop === 0.52 && GYM.rack.barY === 1.32
)
assert('Dumbbell rack is at (4.2, -5.6)', GYM.dumbbells.x === 4.2 && GYM.dumbbells.z === -5.6)
assert('Pull-up rig is at (0, -7.6) with span 3.0m and bar height 2.39m',
  GYM.rig.x === 0 && GYM.rig.z === -7.6 && GYM.rig.span === 3.0 && GYM.rig.barY === 2.39
)

// Bowling
const laneLen = BOWLING.xEnd - BOWLING.xFoul
assert('Bowling lane foul line is at x=15.9, end at x=27.1 (length 11.2m)',
  BOWLING.xFoul === 15.9 && BOWLING.xEnd === 27.1 && Math.abs(laneLen - 11.2) < 1e-4
)
assert('Bowling lane width is 1.06m with 0.24m gutters',
  BOWLING.w === 1.06 && BOWLING.gutter === 0.24
)
assert('Exactly 10 bowling pins defined in triangular formation', PIN_OFFSETS.length === 10)
assert('Bowling pin radius is 0.06m, height is 0.38m, ball radius is 0.109m',
  PIN_R === 0.06 && PIN_H === 0.38 && BALL_R === 0.109
)

// Lounge
assert('Lounge sofa anchor is at (22.5, -18.2)', LOUNGE.x === 22.5 && LOUNGE.z === -18.2)
assert('Lounge coffee table is at (22.5, -19.6)', LOUNGE_TABLE.x === 22.5 && LOUNGE_TABLE.z === -19.6)
assert('Lounge TV is at (22.5, -20.78)', LOUNGE_TV.x === 22.5 && LOUNGE_TV.z === -20.78)
assert('Six dining sets exist in the lounge / dining wing', DINING_SETS.length === 6)
let totalDiningChairs = 0
for (const set of DINING_SETS) {
  totalDiningChairs += diningChairs(set).length
}
assert('Each dining set has 4 chairs (total 24 chairs)', totalDiningChairs === 24)

// Planting
assert('Long planter has exactly 9 shrubs between gym and pool', PLANTING.count === 9)
assert('Planter band runs x: -6.0..6.2, z: -2.4..-0.8',
  PLANTING.x1 === -6.0 && PLANTING.x2 === 6.2 && PLANTING.z1 === -2.4 && PLANTING.z2 === -0.8
)
assert('Two corner garden beds exist along courtyard edges',
  GARDEN_BEDS.length === 2 &&
  GARDEN_BEDS[0].x === 8.4 && GARDEN_BEDS[0].z === 12.6 &&
  GARDEN_BEDS[1].x === -8.4 && GARDEN_BEDS[1].z === 12.6
)

// Verify build.ts props construction integrity
const buildSource = fs.readFileSync(path.join(__dirname, '../src/lib/office/build.ts'), 'utf-8')
assert('build.ts constructs pool basin, stone coping, water surface and ladder',
  buildSource.includes('POOL') &&
  buildSource.includes('water = new THREE.Mesh') &&
  buildSource.includes('coping: a light stone lip') &&
  buildSource.includes('pool ladder')
)
assert('build.ts constructs gym mat, barbell rack, dumbbell rack, pull-up rig, and bench press',
  buildSource.includes('GYM.rack') &&
  buildSource.includes('GYM.dumbbells') &&
  buildSource.includes('GYM.rig') &&
  buildSource.includes('pad = new THREE.Mesh(rbox(0.36, 0.12, 1.25, 0.03)') // bench press
)
assert('build.ts constructs bowling lane surface, ten pins, ball return and score screen',
  buildSource.includes('laneTexture()') &&
  buildSource.includes('PIN_OFFSETS') &&
  buildSource.includes('retBody = box') && // ball return
  buildSource.includes('scrBody = box') // score screen
)
assert('build.ts constructs lounge sofa, coffee table, TV screen and dining sets with wood chairs',
  buildSource.includes('LOUNGE') &&
  buildSource.includes('LOUNGE_TABLE') &&
  buildSource.includes('LOUNGE_TV') &&
  buildSource.includes('DINING_SETS') &&
  buildSource.includes('diningChairs')
)
assert('build.ts constructs long planter with 9 shrubs and corner garden beds',
  buildSource.includes('PLANTING.count') &&
  buildSource.includes('GARDEN_BEDS')
)

// ===========================================================================
// 2. White Daylight Materials & Daylight Shadows
// ===========================================================================
console.log('\n2. White Daylight Materials & Soft Shadows:')

// Materials function exports exist
assert('materials.ts exports marbleLight function', typeof mats.marbleLight === 'function')
assert('materials.ts exports woodWarm function', typeof mats.woodWarm === 'function')
assert('materials.ts exports glassReal function', typeof mats.glassReal === 'function')
assert('materials.ts exports stoneDark function', typeof mats.stoneDark === 'function')
assert('materials.ts exports plasterClean function', typeof mats.plasterClean === 'function')
assert('materials.ts exports woodPanelDark function', typeof mats.woodPanelDark === 'function')
assert('materials.ts exports carpetGrey function', typeof mats.carpetGrey === 'function')
assert('materials.ts exports goldAccent function', typeof mats.goldAccent === 'function')

// Direct inspection of non-canvas materials in node
const plasterMat = mats.plasterClean()
assert('plasterClean is clean light plaster (color 0xf2f4f4, roughness 0.92)',
  plasterMat.color.getHex() === 0xf2f4f4 && plasterMat.roughness === 0.92
)

const goldMat = mats.goldAccent()
assert('goldAccent is brass/gold (color 0xc9a24a, metalness 0.9, roughness 0.28)',
  goldMat.color.getHex() === 0xc9a24a && goldMat.metalness === 0.9 && goldMat.roughness === 0.28
)

// Source audit of PBR parameters for canvas materials
const matsSource = fs.readFileSync(path.join(__dirname, '../src/lib/office/materials.ts'), 'utf-8')
assert('marbleLight specifies glossy light marble (roughness: 0.08, metalness: 0.35, envMapIntensity: 1.6)',
  matsSource.includes('roughness: 0.08') &&
  matsSource.includes('metalness: 0.35') &&
  matsSource.includes('envMapIntensity: 1.6') &&
  matsSource.includes('#efe9dc')
)
assert('woodWarm specifies warm wood grain (roughness: 0.45, metalness: 0.0, #9a7449)',
  matsSource.includes('roughness: 0.45') &&
  matsSource.includes('metalness: 0.0') &&
  matsSource.includes('#9a7449')
)
assert('glassReal specifies physical transparent glass with transmission 0.9',
  matsSource.includes('MeshPhysicalMaterial') &&
  matsSource.includes('transmission: 0.9') &&
  matsSource.includes('roughness: 0.05') &&
  matsSource.includes('transparent: true')
)

// Daylight Sun & Soft Shadows in lights.ts
const scene = new THREE.Scene()
const rig = setupLights(scene, 12) // midday daylight
assert('lights.ts sun light is a DirectionalLight', rig.sun instanceof THREE.DirectionalLight)
assert('Daylight sun color is warm white (0xfff2df)', rig.sun.color.getHex() === 0xfff2df)
assert('Daylight sun intensity is 2.2', rig.sun.intensity === 2.2)
assert('Sun casts shadows (castShadow = true)', rig.sun.castShadow === true)
assert('Sun shadow map resolution is 2048x2048', rig.sun.shadow.mapSize.x === 2048 && rig.sun.shadow.mapSize.y === 2048)
assert('Sun shadow radius is 4 for soft daylight shadows', rig.sun.shadow.radius === 4)
assert('lights.ts includes hemisphere sky fill light', rig.sky instanceof THREE.HemisphereLight)

// ===========================================================================
// 3. Static Audit: Zero Inference & Zero Dispatch in Render Modules
// ===========================================================================
console.log('\n3. Static Code Audit (Render Modules):')

const renderFiles = [
  'src/lib/office/scene.ts',
  'src/lib/office/build.ts',
  'src/lib/office/anim.ts',
  'src/lib/office/avatar.ts',
  'src/lib/office/materials.ts',
  'src/lib/office/contexia-roster.ts',
  'src/lib/office/dummy-roster.ts',
  'src/lib/office/facing.ts',
  'src/lib/office/nav.ts',
  'src/lib/office/layout.ts',
]

const forbiddenImports = [
  'openai',
  '@anthropic',
  'langchain',
  '@google/genai',
  '@google/generative-ai',
  'chatwoot',
]

const forbiddenApiEndpoints = [
  '/api/chat',
  '/api/inference',
  '/api/llm',
  '/api/generate',
]

const forbiddenMutationKeywords = [
  'dispatchTask(',
  'claimTask(',
  'createTask(',
  'mutateTask(',
]

for (const relPath of renderFiles) {
  const fullPath = path.join(__dirname, '..', relPath)
  assert(`File exists: ${relPath}`, fs.existsSync(fullPath))
  const content = fs.readFileSync(fullPath, 'utf-8')

  // Check forbidden AI/LLM package imports
  const foundForbiddenImport = forbiddenImports.find((pkg) => content.includes(`from '${pkg}'`) || content.includes(`from "${pkg}"`))
  assert(`${relPath} has no AI/LLM SDK imports`, !foundForbiddenImport, foundForbiddenImport)

  // Check forbidden API endpoints
  const foundForbiddenEndpoint = forbiddenApiEndpoints.find((ep) => content.includes(ep))
  assert(`${relPath} does not reference LLM inference endpoints`, !foundForbiddenEndpoint, foundForbiddenEndpoint)

  // Check forbidden task mutations
  const foundForbiddenMutation = forbiddenMutationKeywords.find((kw) => content.includes(kw))
  assert(`${relPath} does not invoke task mutation or claim dispatch`, !foundForbiddenMutation, foundForbiddenMutation)
}

// Ensure anim.ts and avatar.ts do not invoke network fetch
const animSource = fs.readFileSync(path.join(__dirname, '../src/lib/office/anim.ts'), 'utf-8')
assert('anim.ts contains zero network fetch calls', !animSource.includes('fetch('))

const avatarSource = fs.readFileSync(path.join(__dirname, '../src/lib/office/avatar.ts'), 'utf-8')
assert('avatar.ts contains zero network fetch calls', !avatarSource.includes('fetch('))

// ===========================================================================
// 4. Runtime Simulation: 100 Idle Animation Ticks
// ===========================================================================
console.log('\n4. Runtime Simulation (100 Idle Animation Ticks):')

// Spies for inference, network and task calls
let inferenceCallCount = 0
let networkRequestCount = 0
let taskClaimCount = 0

// Mock global fetch spy to guarantee no network call happens during simulation
const originalFetch = globalThis.fetch
globalThis.fetch = (async (...args: any[]) => {
  networkRequestCount++
  if (String(args[0]).includes('inference') || String(args[0]).includes('chat')) {
    inferenceCallCount++
  }
  if (String(args[0]).includes('task')) {
    taskClaimCount++
  }
  return new Response(JSON.stringify({ ok: true }))
}) as any

try {
  // Build 10 avatars from the Contexia roster (9 business roles + 1 receptionist)
  const roster = getContexiaRoster()
  assert('Roster has 10 avatars for simulation', roster.length === 10)

  const idleActivities: Activity[] = [
    'idle',
    'pool',
    'recline',
    'sofa',
    'bowling',
    'garden',
    'coffee',
    'eat',
    'read',
    'typing',
  ]

  const simulationRoles: AgentRole[] = [
    'manager',
    'backend',
    'qa',
    'manager',
    'researcher',
    'devops',
    'manager',
    'marketing',
    'ceo',
    'content',
  ]

  const animAgents: AnimAgent[] = roster.map((m, idx) => ({
    avatar: buildAvatar(simulationRoles[idx] || 'backend'),
    activity: idleActivities[idx % idleActivities.length],
    ease: 1.0,
    phase: idx * 0.7,
  }))

  assert('Created 10 AnimAgent instances with low-poly rigs', animAgents.length === 10)

  // Run 100 simulation frames at 60 FPS (dt = 0.016s)
  const TICKS = 100
  const dt = 0.016

  for (let tick = 0; tick < TICKS; tick++) {
    const t = tick * dt
    for (const agent of animAgents) {
      animate(agent, t, dt)
    }
  }

  assert(`Ran ${TICKS} consecutive animation frames across ${animAgents.length} avatars (total ${TICKS * animAgents.length} body ticks)`, true)

  // Verify invariants after 100 frames
  assert('Total model inference calls during 100 idle frames is strictly 0', inferenceCallCount === 0, `got ${inferenceCallCount}`)
  assert('Total network mutation requests during 100 idle frames is strictly 0', networkRequestCount === 0, `got ${networkRequestCount}`)
  assert('Total task claims/dispatches during 100 idle frames is strictly 0', taskClaimCount === 0, `got ${taskClaimCount}`)

  // Verify avatar pose integrity (all angles and coordinates are finite, no NaN/Infinity)
  let posesValid = true
  for (const agent of animAgents) {
    const av = agent.avatar
    if (
      isNaN(av.head.rotation.x) || isNaN(av.head.rotation.y) ||
      isNaN(av.chest.rotation.x) || isNaN(av.chest.rotation.y) ||
      isNaN(av.hips.position.y) ||
      !isFinite(av.head.rotation.x) || !isFinite(av.chest.rotation.x)
    ) {
      posesValid = false
      break
    }
  }
  assert('All avatar body joints and matrices remain finite and stable throughout 100 frames', posesValid)

} finally {
  globalThis.fetch = originalFetch
}

// ===========================================================================
// Summary
// ===========================================================================
console.log(`\nResults: ${checks - failures}/${checks} checks passed.`)
if (failures > 0) {
  console.error(`\nFAILED: ${failures} checks failed.`)
  process.exit(1)
} else {
  console.log('\nSUCCESS: All props, materials, and zero idle inference checks passed.\n')
}
