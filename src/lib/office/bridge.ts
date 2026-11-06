/**
 * Office Bridge Event & Profile Enrollment Engine for Bunker Virtual Office.
 *
 * Task 9.11 of bunker-virtual-office OpenSpec change.
 *
 * Requirements & Invariants:
 * 1. Bridge Configuration:
 *    - Events fail closed with 'unconfigured_bridge' if bridge is not configured or enabled=false.
 * 2. Authentication:
 *    - Events fail closed with 'unauthenticated_event' if authToken is invalid or empty.
 * 3. Source Whitelist:
 *    - Allowed sources: 'terminal', 'telegram', 'office_bridge'.
 *    - Unallowed sources fail closed with 'unsupported_source'.
 * 4. Profile Enrollment Gate:
 *    - Only enrolled profiles can ingest events.
 *    - Unenrolled profiles fail closed with 'profile_not_enrolled'.
 *    - Ingesting events updates profile's lastActivitySource and lastActivityTs.
 *    - restartCount MUST NOT increase upon event ingestion (no silent profile restart).
 * 5. Deduplication:
 *    - Duplicate eventId fails closed with 'duplicate_event' without double-reflection.
 */

export type BridgeSource = 'terminal' | 'telegram' | 'office_bridge'

export type OfficeBridgeEvent = {
  eventId: string
  source: BridgeSource
  profileId: string
  sessionId: string
  authToken: string
  timestamp: number
  action: string
  payload?: Record<string, unknown>
}

export type BridgeConfig = {
  enabled: boolean
  authToken: string
  allowedSources: BridgeSource[]
}

export type ProfileEnrollment = {
  profileId: string
  enrolled: boolean
  enrolledAt: number
  restartCount: number
  lastActivitySource?: string
  lastActivityTs?: number
}

export type BridgeIngestResult = {
  success: boolean
  reflected: boolean
  reason?: string
  activity?: {
    profileId: string
    source: BridgeSource
    freshness: number
    eventId: string
  }
}

export class OfficeBridge {
  private config: BridgeConfig | null = null
  private enrollments = new Map<string, ProfileEnrollment>()
  private seenEvents = new Map<string, OfficeBridgeEvent>()

  configure(config: BridgeConfig): void {
    this.config = {
      enabled: config.enabled,
      authToken: config.authToken,
      allowedSources: [...config.allowedSources],
    }
  }

  getConfig(): BridgeConfig | null {
    return this.config ? { ...this.config, allowedSources: [...this.config.allowedSources] } : null
  }

  enrollProfile(profileId: string, timestamp = Date.now()): ProfileEnrollment {
    const existing = this.enrollments.get(profileId)
    if (existing) {
      const updated: ProfileEnrollment = {
        ...existing,
        enrolled: true,
      }
      this.enrollments.set(profileId, updated)
      return updated
    }

    const newEnrollment: ProfileEnrollment = {
      profileId,
      enrolled: true,
      enrolledAt: timestamp,
      restartCount: 0,
    }
    this.enrollments.set(profileId, newEnrollment)
    return newEnrollment
  }

  getProfileEnrollment(profileId: string): ProfileEnrollment | undefined {
    const record = this.enrollments.get(profileId)
    return record ? { ...record } : undefined
  }

  ingestBridgeEvent(event: OfficeBridgeEvent): BridgeIngestResult {
    // 1. Unconfigured or disabled bridge
    if (!this.config || !this.config.enabled) {
      return {
        success: false,
        reflected: false,
        reason: 'unconfigured_bridge',
      }
    }

    // 2. Authentication check
    if (!event.authToken || event.authToken !== this.config.authToken) {
      return {
        success: false,
        reflected: false,
        reason: 'unauthenticated_event',
      }
    }

    // 3. Allowed source check
    if (!this.config.allowedSources.includes(event.source)) {
      return {
        success: false,
        reflected: false,
        reason: 'unsupported_source',
      }
    }

    // 4. Profile enrollment check
    const profile = this.enrollments.get(event.profileId)
    if (!profile || !profile.enrolled) {
      return {
        success: false,
        reflected: false,
        reason: 'profile_not_enrolled',
      }
    }

    // 5. Deduplication check
    if (this.seenEvents.has(event.eventId)) {
      return {
        success: false,
        reflected: false,
        reason: 'duplicate_event',
      }
    }

    // 6. Record event
    this.seenEvents.set(event.eventId, { ...event })

    // 7. Update profile activity while strictly preserving restartCount (no silent restart)
    const updatedProfile: ProfileEnrollment = {
      ...profile,
      lastActivitySource: event.source,
      lastActivityTs: event.timestamp,
      // restartCount is explicitly NOT incremented
      restartCount: profile.restartCount,
    }
    this.enrollments.set(event.profileId, updatedProfile)

    return {
      success: true,
      reflected: true,
      reason: 'ok',
      activity: {
        profileId: event.profileId,
        source: event.source,
        freshness: event.timestamp,
        eventId: event.eventId,
      },
    }
  }

  reset(): void {
    this.config = null
    this.enrollments.clear()
    this.seenEvents.clear()
  }
}

// Global default singleton instance
const defaultBridgeInstance = new OfficeBridge()

export function configureBridge(config: BridgeConfig): void {
  defaultBridgeInstance.configure(config)
}

export function getBridgeConfig(): BridgeConfig | null {
  return defaultBridgeInstance.getConfig()
}

export function enrollProfile(profileId: string, timestamp?: number): ProfileEnrollment {
  return defaultBridgeInstance.enrollProfile(profileId, timestamp)
}

export function getProfileEnrollment(profileId: string): ProfileEnrollment | undefined {
  return defaultBridgeInstance.getProfileEnrollment(profileId)
}

export function ingestBridgeEvent(event: OfficeBridgeEvent): BridgeIngestResult {
  return defaultBridgeInstance.ingestBridgeEvent(event)
}

export function resetBridgeState(): void {
  defaultBridgeInstance.reset()
}
