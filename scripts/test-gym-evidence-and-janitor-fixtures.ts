/**
 * Test Gym Skill/Eval Evidence & Janitor Outcome Verification Fixtures — Task 9.12
 *
 * Verifies:
 * 1. Idle leisure without evidence cannot select gym spots (bypassed in idle wander).
 * 2. Keywords in prompt or chat cannot start gym exercise (`keywords_cannot_start_gym_exercise`).
 * 3. Real skill/eval/test evidence allows gym exercise.
 * 4. DEMO evidence is visibly isolated with `isDemo: true`.
 * 5. Janitor cleanup without actual readback denies animation (`readback_not_verified`).
 * 6. Janitor cleanup without admin confirmation denies animation (`admin_confirmation_required`).
 * 7. Confirmed reset PLUS actual readback permits animation (`animation_allowed`).
 * 8. DEMO janitor fixtures are visibly isolated.
 *
 * Run: npx tsx scripts/test-gym-evidence-and-janitor-fixtures.ts
 */

import {
  registerGymEvidence,
  hasGymEvidence,
  canPerformGymExercise,
  isDemoEvidenceIsolated,
  isDemoJanitorFixtureIsolated,
  verifyJanitorOutcome,
  clearGymEvidence,
  type GymEvidenceRecord,
  type JanitorReadbackRecord,
  type JanitorOutcomeFixture,
} from '../src/lib/office/gym-janitor'
import { IDLE_SPOTS, type IdleSpot } from '../src/lib/office/layout'

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
  console.log('\n--- Gym Evidence & Janitor Outcome Fixture Tests (Task 9.12) ---\n')

  // ---------------------------------------------------------------------------
  // 1. Idle Leisure Without Evidence Cannot Select Gym Spots
  // ---------------------------------------------------------------------------
  console.log('1. Idle Leisure Without Evidence Cannot Select Gym Spots:')
  {
    clearGymEvidence()
    const agentName = 'centinela'

    // Verify agent initially has no gym evidence
    assert('Agent starts with no gym evidence', !hasGymEvidence(agentName))

    // canPerformGymExercise fails closed for idle leisure
    const idleCheck = canPerformGymExercise(agentName)
    assert(
      'Idle leisure without evidence denies gym exercise',
      idleCheck.allowed === false && idleCheck.reason === 'idle_leisure_cannot_start_gym_exercise',
      `got allowed=${idleCheck.allowed}, reason=${idleCheck.reason}`
    )

    // Simulate idle wander spot selection loop over IDLE_SPOTS
    const gymSpots = IDLE_SPOTS.filter(
      (s) => s.act === 'benchpress' || s.act === 'pullup' || s.act === 'muscleup'
    )
    assert('IDLE_SPOTS contains gym exercise spots (benchpress/pullup/muscleup)', gymSpots.length > 0)

    // Run selection algorithm with no evidence: all gym spots must be skipped
    function selectSpotFor(name: string, spots: IdleSpot[]): IdleSpot | null {
      for (const cand of spots) {
        if (cand.act === 'benchpress' || cand.act === 'pullup' || cand.act === 'muscleup') {
          if (!hasGymEvidence(name)) continue
        }
        return cand
      }
      return null
    }

    // Only testing with gym spots available
    const selectedForUnverified = selectSpotFor(agentName, gymSpots)
    assert(
      'Idle wander skips all gym exercise spots when unverified',
      selectedForUnverified === null
    )

    // Now register evidence and test that gym spot IS selectable
    registerGymEvidence({
      id: 'ev-test-select-01',
      agentName,
      kind: 'skill_eval',
      skillName: 'audit_tax_v2',
      status: 'passed',
      timestamp: Date.now(),
      isDemo: false,
    })
    const selectedForVerified = selectSpotFor(agentName, gymSpots)
    assert(
      'Idle wander allows gym exercise spot when verified evidence exists',
      selectedForVerified !== null &&
        (selectedForVerified.act === 'benchpress' ||
          selectedForVerified.act === 'pullup' ||
          selectedForVerified.act === 'muscleup')
    )
  }

  // ---------------------------------------------------------------------------
  // 2. Keywords in Prompt or Chat Cannot Start Gym Exercise
  // ---------------------------------------------------------------------------
  console.log('\n2. Keywords in Prompt or Chat Cannot Start Gym Exercise:')
  {
    clearGymEvidence()
    const agentName = 'pulso'

    const testPhrases = [
      'gym',
      'workout',
      'exercise',
      'benchpress',
      'pullup',
      'muscleup',
      'Please head to the gym and work out',
      'Start exercise benchpress now',
      'Do some pullup reps in leisure',
    ]

    for (const phrase of testPhrases) {
      const res = canPerformGymExercise(agentName, phrase)
      assert(
        `Keyword phrase "${phrase.slice(0, 30)}" rejected without evidence`,
        res.allowed === false && res.reason === 'keywords_cannot_start_gym_exercise',
        `got allowed=${res.allowed}, reason=${res.reason}`
      )
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Real Skill / Eval / Test Evidence Allows Gym Exercise
  // ---------------------------------------------------------------------------
  console.log('\n3. Real Skill / Eval / Test Evidence Allows Gym Exercise:')
  {
    clearGymEvidence()
    const agentName = 'radar'

    // Register a valid skill_eval evidence
    const skillEv: GymEvidenceRecord = {
      id: 'ev-radar-skill-01',
      agentName,
      kind: 'skill_eval',
      skillName: 'competitor_intel_v1',
      score: 95.5,
      status: 'passed',
      timestamp: 1730000000,
      isDemo: false,
    }
    registerGymEvidence(skillEv)

    assert('hasGymEvidence returns true for registered agent', hasGymEvidence(agentName))

    const access1 = canPerformGymExercise(agentName)
    assert(
      'Verified skill evidence unlocks gym exercise',
      access1.allowed === true && access1.reason === 'evidence_verified' && access1.evidence?.id === skillEv.id
    )

    // Even if prompt keywords are passed, verified evidence takes precedence
    const accessWithKeyword = canPerformGymExercise(agentName, 'benchpress')
    assert(
      'Verified agent with keywords still allowed based on evidence',
      accessWithKeyword.allowed === true && accessWithKeyword.reason === 'evidence_verified'
    )

    // Test execution evidence
    const testEv: GymEvidenceRecord = {
      id: 'ev-taty-test-01',
      agentName: 'taty',
      kind: 'test_run',
      testId: 'test_social_sync_pipeline',
      status: 'completed',
      timestamp: 1730000010,
      isDemo: false,
    }
    registerGymEvidence(testEv)
    const accessTest = canPerformGymExercise('taty')
    assert(
      'Test execution evidence unlocks gym exercise',
      accessTest.allowed === true && accessTest.reason === 'evidence_verified'
    )
  }

  // ---------------------------------------------------------------------------
  // 4. DEMO Evidence Visibly Isolated
  // ---------------------------------------------------------------------------
  console.log('\n4. DEMO Evidence Visibly Isolated:')
  {
    const demoEvidence: GymEvidenceRecord = {
      id: 'ev-demo-isolated-01',
      agentName: 'orchestrator',
      kind: 'benchmark',
      score: 100,
      status: 'passed',
      timestamp: 1730000050,
      isDemo: true,
    }
    const prodEvidence: GymEvidenceRecord = {
      ...demoEvidence,
      id: 'ev-prod-01',
      isDemo: false,
    }

    assert(
      'DEMO evidence identified as isolated (isDemo: true)',
      isDemoEvidenceIsolated(demoEvidence) === true
    )
    assert(
      'Production evidence not flagged as demo (isDemo: false)',
      isDemoEvidenceIsolated(prodEvidence) === false
    )
  }

  // ---------------------------------------------------------------------------
  // 5. Janitor Cleanup Without Actual Readback Denies Animation
  // ---------------------------------------------------------------------------
  console.log('\n5. Janitor Cleanup Without Actual Readback Denies Animation:')
  {
    const fixture: JanitorOutcomeFixture = {
      id: 'jan-fix-01',
      sessionId: 'session-stalled-01',
      previewConfirmed: true,
      adminConfirmed: true,
      resetSuccess: true,
      readbackVerified: false,
      animationAllowed: false,
      isDemo: false,
    }

    const dirtyReadback: JanitorReadbackRecord = {
      sessionId: 'session-stalled-01',
      preResetHash: 'hash-dirty-01',
      postResetHash: 'hash-dirty-01', // not cleaned
      verifiedClean: false,
      actualReadbackTimestamp: 1730000100,
    }

    const outcome = verifyJanitorOutcome(fixture, dirtyReadback)
    assert(
      'Unclean readback strictly denies animation with readback_not_verified',
      outcome.animationAllowed === false && outcome.reason === 'readback_not_verified',
      `got animationAllowed=${outcome.animationAllowed}, reason=${outcome.reason}`
    )
  }

  // ---------------------------------------------------------------------------
  // 6. Janitor Cleanup Without Admin Confirmation Denies Animation
  // ---------------------------------------------------------------------------
  console.log('\n6. Janitor Cleanup Without Admin Confirmation Denies Animation:')
  {
    const fixtureNoAdmin: JanitorOutcomeFixture = {
      id: 'jan-fix-02',
      sessionId: 'session-stalled-02',
      previewConfirmed: true,
      adminConfirmed: false, // missing admin confirmation
      resetSuccess: true,
      readbackVerified: true,
      animationAllowed: false,
      isDemo: false,
    }

    const cleanReadback: JanitorReadbackRecord = {
      sessionId: 'session-stalled-02',
      preResetHash: 'hash-dirty-02',
      postResetHash: 'hash-clean-02',
      verifiedClean: true,
      actualReadbackTimestamp: 1730000200,
    }

    const outcome = verifyJanitorOutcome(fixtureNoAdmin, cleanReadback)
    assert(
      'Unconfirmed janitor reset strictly denies animation with admin_confirmation_required',
      outcome.animationAllowed === false && outcome.reason === 'admin_confirmation_required',
      `got animationAllowed=${outcome.animationAllowed}, reason=${outcome.reason}`
    )

    // Also check unconfirmed preview
    const fixtureNoPreview: JanitorOutcomeFixture = {
      ...fixtureNoAdmin,
      adminConfirmed: true,
      previewConfirmed: false,
    }
    const outcomePreview = verifyJanitorOutcome(fixtureNoPreview, cleanReadback)
    assert(
      'Unconfirmed preview denies animation with preview_not_confirmed',
      outcomePreview.animationAllowed === false && outcomePreview.reason === 'preview_not_confirmed'
    )
  }

  // ---------------------------------------------------------------------------
  // 7. Confirmed Reset PLUS Actual Readback Permits Animation
  // ---------------------------------------------------------------------------
  console.log('\n7. Confirmed Reset PLUS Actual Readback Permits Animation:')
  {
    const validFixture: JanitorOutcomeFixture = {
      id: 'jan-fix-03',
      sessionId: 'session-stalled-03',
      previewConfirmed: true,
      adminConfirmed: true,
      resetSuccess: true,
      readbackVerified: false,
      animationAllowed: false,
      isDemo: false,
    }

    const verifiedReadback: JanitorReadbackRecord = {
      sessionId: 'session-stalled-03',
      preResetHash: 'dirty-state-aaa',
      postResetHash: 'clean-state-bbb',
      verifiedClean: true,
      actualReadbackTimestamp: 1730000300,
    }

    const outcome = verifyJanitorOutcome(validFixture, verifiedReadback)
    assert(
      'Confirmed reset PLUS verified clean readback permits animation (animation_allowed)',
      outcome.animationAllowed === true && outcome.reason === 'animation_allowed',
      `got animationAllowed=${outcome.animationAllowed}, reason=${outcome.reason}`
    )
  }

  // ---------------------------------------------------------------------------
  // 8. DEMO Janitor Fixtures Visibly Isolated
  // ---------------------------------------------------------------------------
  console.log('\n8. DEMO Janitor Fixtures Visibly Isolated:')
  {
    const demoFixture: JanitorOutcomeFixture = {
      id: 'jan-demo-fixture-01',
      sessionId: 'session-demo-01',
      previewConfirmed: true,
      adminConfirmed: true,
      resetSuccess: true,
      readbackVerified: true,
      animationAllowed: true,
      isDemo: true,
    }
    const prodFixture: JanitorOutcomeFixture = {
      ...demoFixture,
      id: 'jan-prod-fixture-01',
      isDemo: false,
    }

    assert(
      'DEMO janitor fixture identified as isolated (isDemo: true)',
      isDemoJanitorFixtureIsolated(demoFixture) === true
    )
    assert(
      'Production janitor fixture not flagged as demo (isDemo: false)',
      isDemoJanitorFixtureIsolated(prodFixture) === false
    )
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\nResults: ${checks} checks, ${failures} failures\n`)
  if (failures > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Unhandled test failure:', err)
  process.exit(1)
})
