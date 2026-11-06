/**
 * Test Authenticated Office Bridge Events & Profile Enrollment — Task 9.11
 *
 * Verifies:
 * 1. Unconfigured bridge: events fail closed with `unconfigured_bridge`.
 * 2. Authentication: invalid auth token fails closed with `unauthenticated_event`.
 * 3. Profile enrollment: unenrolled profile fails closed with `profile_not_enrolled`.
 * 4. Terminal event ingestion: valid terminal event succeeds, reflects source 'terminal' and freshness timestamp.
 * 5. Telegram event ingestion: valid Telegram event succeeds, reflects source 'telegram' and freshness timestamp.
 * 6. Event deduplication: duplicate eventId fails closed with `duplicate_event` (no double reflection).
 * 7. Profile stability: restartCount remains strictly 0 across all successful and failed event ingestions (no silent profile restart).
 *
 * Run: npx tsx scripts/test-office-bridge-events.ts
 */

import {
  configureBridge,
  enrollProfile,
  getProfileEnrollment,
  getBridgeConfig,
  ingestBridgeEvent,
  resetBridgeState,
  OfficeBridge,
  type BridgeConfig,
  type OfficeBridgeEvent,
} from '../src/lib/office/bridge'

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
  console.log('\n--- Office Bridge Event & Profile Enrollment Tests (Task 9.11) ---\n')

  // ---------------------------------------------------------------------------
  // 1. Unconfigured Bridge
  // ---------------------------------------------------------------------------
  console.log('1. Unconfigured Bridge Rejection:')
  {
    resetBridgeState()

    const unconfiguredEvent: OfficeBridgeEvent = {
      eventId: 'evt-unconf-01',
      source: 'terminal',
      profileId: 'profile-centinela',
      sessionId: 'sess-01',
      authToken: 'some-token',
      timestamp: 1000,
      action: 'terminal_exec',
    }

    const res1 = ingestBridgeEvent(unconfiguredEvent)
    assert('Event on unconfigured bridge fails', res1.success === false)
    assert('Event on unconfigured bridge is not reflected', res1.reflected === false)
    assert('Reason is unconfigured_bridge', res1.reason === 'unconfigured_bridge')

    // Disabled bridge test
    configureBridge({
      enabled: false,
      authToken: 'token-abc',
      allowedSources: ['terminal', 'telegram'],
    })
    const res2 = ingestBridgeEvent({ ...unconfiguredEvent, authToken: 'token-abc' })
    assert('Event on disabled bridge fails', res2.success === false)
    assert('Reason on disabled bridge is unconfigured_bridge', res2.reason === 'unconfigured_bridge')
  }

  // ---------------------------------------------------------------------------
  // 2. Authentication Enforcement
  // ---------------------------------------------------------------------------
  console.log('\n2. Authentication Enforcement:')
  {
    resetBridgeState()
    const validConfig: BridgeConfig = {
      enabled: true,
      authToken: 'hermes-secure-token-9988',
      allowedSources: ['terminal', 'telegram', 'office_bridge'],
    }
    configureBridge(validConfig)
    enrollProfile('profile-centinela')

    // Wrong token
    const wrongTokenEvent: OfficeBridgeEvent = {
      eventId: 'evt-auth-bad',
      source: 'terminal',
      profileId: 'profile-centinela',
      sessionId: 'sess-02',
      authToken: 'wrong-token-123',
      timestamp: 1100,
      action: 'exec',
    }
    const resAuth1 = ingestBridgeEvent(wrongTokenEvent)
    assert('Invalid auth token is rejected', resAuth1.success === false)
    assert('Invalid auth token reflected is false', resAuth1.reflected === false)
    assert('Reason is unauthenticated_event', resAuth1.reason === 'unauthenticated_event')

    // Empty token
    const emptyTokenEvent: OfficeBridgeEvent = {
      ...wrongTokenEvent,
      eventId: 'evt-auth-empty',
      authToken: '',
    }
    const resAuth2 = ingestBridgeEvent(emptyTokenEvent)
    assert('Empty auth token is rejected', resAuth2.success === false)
    assert('Empty token reason is unauthenticated_event', resAuth2.reason === 'unauthenticated_event')
  }

  // ---------------------------------------------------------------------------
  // 3. Source Whitelist Verification
  // ---------------------------------------------------------------------------
  console.log('\n3. Source Whitelist Verification:')
  {
    resetBridgeState()
    configureBridge({
      enabled: true,
      authToken: 'hermes-valid-token',
      allowedSources: ['terminal', 'telegram'],
    })
    enrollProfile('profile-centinela')

    const unallowedSourceEvent: OfficeBridgeEvent = {
      eventId: 'evt-source-bad',
      source: 'office_bridge', // not in allowedSources for this config
      profileId: 'profile-centinela',
      sessionId: 'sess-03',
      authToken: 'hermes-valid-token',
      timestamp: 1200,
      action: 'ping',
    }
    const resSource = ingestBridgeEvent(unallowedSourceEvent)
    assert('Source not in allowedSources is rejected', resSource.success === false)
    assert('Reason is unsupported_source', resSource.reason === 'unsupported_source')
  }

  // ---------------------------------------------------------------------------
  // 4. Profile Enrollment Gate
  // ---------------------------------------------------------------------------
  console.log('\n4. Profile Enrollment Gate:')
  {
    resetBridgeState()
    configureBridge({
      enabled: true,
      authToken: 'hermes-valid-token',
      allowedSources: ['terminal', 'telegram', 'office_bridge'],
    })

    // Event targeting unenrolled profile
    const unenrolledEvent: OfficeBridgeEvent = {
      eventId: 'evt-unenrolled-01',
      source: 'terminal',
      profileId: 'profile-stranger',
      sessionId: 'sess-04',
      authToken: 'hermes-valid-token',
      timestamp: 1300,
      action: 'shell_run',
    }
    const resEnroll = ingestBridgeEvent(unenrolledEvent)
    assert('Unenrolled profile event is rejected', resEnroll.success === false)
    assert('Reason is profile_not_enrolled', resEnroll.reason === 'profile_not_enrolled')

    // Verify stranger was not silently enrolled
    const enrollment = getProfileEnrollment('profile-stranger')
    assert('Stranger profile was NOT auto-enrolled', enrollment === undefined)
  }

  // ---------------------------------------------------------------------------
  // 5. Terminal Event Ingestion
  // ---------------------------------------------------------------------------
  console.log('\n5. Terminal Event Ingestion:')
  {
    resetBridgeState()
    configureBridge({
      enabled: true,
      authToken: 'hermes-valid-token',
      allowedSources: ['terminal', 'telegram', 'office_bridge'],
    })
    enrollProfile('profile-centinela')

    const termEvent: OfficeBridgeEvent = {
      eventId: 'evt-term-101',
      source: 'terminal',
      profileId: 'profile-centinela',
      sessionId: 'sess-term-01',
      authToken: 'hermes-valid-token',
      timestamp: 1700001000,
      action: 'command_run',
      payload: { cmd: 'pnpm test' },
    }
    const resTerm = ingestBridgeEvent(termEvent)
    assert('Valid terminal event succeeds', resTerm.success === true)
    assert('Terminal event is reflected', resTerm.reflected === true)
    assert('Terminal event reason is ok', resTerm.reason === 'ok')
    assert('Activity profile matches', resTerm.activity?.profileId === 'profile-centinela')
    assert('Activity source is terminal', resTerm.activity?.source === 'terminal')
    assert('Activity freshness matches timestamp', resTerm.activity?.freshness === 1700001000)
    assert('Activity eventId matches', resTerm.activity?.eventId === 'evt-term-101')

    const updatedProfile = getProfileEnrollment('profile-centinela')
    assert('Profile lastActivitySource updated to terminal', updatedProfile?.lastActivitySource === 'terminal')
    assert('Profile lastActivityTs updated to timestamp', updatedProfile?.lastActivityTs === 1700001000)
  }

  // ---------------------------------------------------------------------------
  // 6. Telegram Event Ingestion
  // ---------------------------------------------------------------------------
  console.log('\n6. Telegram Event Ingestion:')
  {
    resetBridgeState()
    configureBridge({
      enabled: true,
      authToken: 'hermes-valid-token',
      allowedSources: ['terminal', 'telegram', 'office_bridge'],
    })
    enrollProfile('profile-pulso')

    const tgEvent: OfficeBridgeEvent = {
      eventId: 'evt-tg-202',
      source: 'telegram',
      profileId: 'profile-pulso',
      sessionId: 'sess-tg-01',
      authToken: 'hermes-valid-token',
      timestamp: 1700002000,
      action: 'telegram_msg',
      payload: { chat_id: 998877, text: 'Market feed normal' },
    }
    const resTg = ingestBridgeEvent(tgEvent)
    assert('Valid Telegram event succeeds', resTg.success === true)
    assert('Telegram event is reflected', resTg.reflected === true)
    assert('Telegram event reason is ok', resTg.reason === 'ok')
    assert('Activity profile matches', resTg.activity?.profileId === 'profile-pulso')
    assert('Activity source is telegram', resTg.activity?.source === 'telegram')
    assert('Activity freshness matches timestamp', resTg.activity?.freshness === 1700002000)
    assert('Activity eventId matches', resTg.activity?.eventId === 'evt-tg-202')

    const updatedProfile = getProfileEnrollment('profile-pulso')
    assert('Profile lastActivitySource updated to telegram', updatedProfile?.lastActivitySource === 'telegram')
    assert('Profile lastActivityTs updated to timestamp', updatedProfile?.lastActivityTs === 1700002000)
  }

  // ---------------------------------------------------------------------------
  // 7. Deduplication
  // ---------------------------------------------------------------------------
  console.log('\n7. Event Deduplication:')
  {
    resetBridgeState()
    configureBridge({
      enabled: true,
      authToken: 'hermes-valid-token',
      allowedSources: ['terminal', 'telegram', 'office_bridge'],
    })
    enrollProfile('profile-centinela')

    const dupEvent: OfficeBridgeEvent = {
      eventId: 'evt-dedup-999',
      source: 'terminal',
      profileId: 'profile-centinela',
      sessionId: 'sess-05',
      authToken: 'hermes-valid-token',
      timestamp: 1700003000,
      action: 'build',
    }

    const firstIngest = ingestBridgeEvent(dupEvent)
    assert('First event ingest succeeds', firstIngest.success === true)

    const secondIngest = ingestBridgeEvent(dupEvent)
    assert('Duplicate event fails', secondIngest.success === false)
    assert('Duplicate event is not reflected', secondIngest.reflected === false)
    assert('Reason is duplicate_event', secondIngest.reason === 'duplicate_event')
  }

  // ---------------------------------------------------------------------------
  // 8. Profile Stability / No Silent Profile Restarts
  // ---------------------------------------------------------------------------
  console.log('\n8. Profile Stability & Preservation of restartCount:')
  {
    resetBridgeState()
    configureBridge({
      enabled: true,
      authToken: 'hermes-valid-token',
      allowedSources: ['terminal', 'telegram', 'office_bridge'],
    })
    const initialProf = enrollProfile('profile-centinela')
    assert('Initial restartCount is 0', initialProf.restartCount === 0)

    // Multiple successful terminal and telegram events
    for (let i = 1; i <= 5; i++) {
      const ev: OfficeBridgeEvent = {
        eventId: `evt-stab-${i}`,
        source: i % 2 === 0 ? 'terminal' : 'telegram',
        profileId: 'profile-centinela',
        sessionId: `sess-${i}`,
        authToken: 'hermes-valid-token',
        timestamp: 1700004000 + i * 100,
        action: `action_${i}`,
      }
      const res = ingestBridgeEvent(ev)
      assert(`Event ${i} succeeded`, res.success === true)

      const prof = getProfileEnrollment('profile-centinela')
      assert(`Event ${i} preserved restartCount at 0 (no silent restart)`, prof?.restartCount === 0)
    }

    // Failed events (auth error, duplicate error, unsupported source) also do not alter restartCount
    ingestBridgeEvent({
      eventId: 'evt-fail-1',
      source: 'terminal',
      profileId: 'profile-centinela',
      sessionId: 'sess-fail',
      authToken: 'bad-token',
      timestamp: 1700005000,
      action: 'fail',
    })
    const profAfterFail = getProfileEnrollment('profile-centinela')
    assert('Failed event ingestion strictly preserves restartCount at 0', profAfterFail?.restartCount === 0)
  }

  // ---------------------------------------------------------------------------
  // 9. OfficeBridge Isolated Class Instance
  // ---------------------------------------------------------------------------
  console.log('\n9. OfficeBridge Isolated Instance Test:')
  {
    const bridge = new OfficeBridge()
    assert('New instance has null config', bridge.getConfig() === null)

    bridge.configure({
      enabled: true,
      authToken: 'token-instance',
      allowedSources: ['office_bridge'],
    })
    bridge.enrollProfile('profile-inst-1')

    const ev: OfficeBridgeEvent = {
      eventId: 'evt-inst-1',
      source: 'office_bridge',
      profileId: 'profile-inst-1',
      sessionId: 'sess-inst',
      authToken: 'token-instance',
      timestamp: 5000,
      action: 'bridge_sync',
    }
    const res = bridge.ingestBridgeEvent(ev)
    assert('Isolated bridge instance processes event correctly', res.success === true)
    assert('Activity source matches office_bridge', res.activity?.source === 'office_bridge')

    const prof = bridge.getProfileEnrollment('profile-inst-1')
    assert('Isolated profile restartCount is 0', prof?.restartCount === 0)
  }

  // Summary
  if (failures > 0) {
    console.error(`\nFailed with ${failures} error(s) out of ${checks} checks.`)
    process.exit(1)
  } else {
    console.log(`\nAll ${checks} checks passed successfully.`)
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err)
  process.exit(1)
})
