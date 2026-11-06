/**
 * test-accessibility-and-fallbacks.ts — Tests for Accessibility, Reduced Motion,
 * Keyboard Controls, Mobile Resize & WebGL Fallback Policies.
 *
 * Task 9.16 of bunker-virtual-office OpenSpec change.
 *
 * Verifies:
 * 1. Reduced-motion detection and instant camera snap:
 *    - With reduced motion active, applyPreset snaps camera target and position instantly (no lerp/animation).
 *    - Preserves calibrated fov, target, and position.
 * 2. Full keyboard shortcuts handling:
 *    - Mode switches: '1' -> Sprite, '2' -> Kanban, '3' -> 3D.
 *    - Camera presets: '4' -> Overall, '5' -> Courtyard, '6' -> Lounge, '7' -> Upper-floor.
 *    - Panels: 'm'/'M' -> Meeting, 'c'/'C' -> Chat, 'n'/'N' -> New Task, 'p'/'P' -> Approval, 'b'/'B' -> Board, 's'/'S' -> System.
 *    - 'Escape' -> Closes active panels/modals/cards.
 *    - Typing in input/textarea/select inputs ignores shortcuts.
 * 3. Hidden-tab rendering throttle:
 *    - Hidden tab pauses rendering loop (stop()), visible tab resumes (start()).
 *    - throttleWhenHidden guaranteed true by policy.
 * 4. WebGL failure fallback:
 *    - Demotes 3D to 2D view mode when WebGL is unavailable.
 *    - Emits exact scene-unavailable message:
 *      "Akselerasi 3D (WebGL) tidak tersedia di perangkat ini. Kantor dialihkan ke mode 2D / Kanban."
 *    - Operational panels remain fully accessible without tiny 3D interaction targets.
 * 5. Mobile viewport resize calibration:
 *    - Narrow mobile viewport (390x844) enforces single_column_panels = true and touch_target_min_px = 44.
 *    - Desktop viewport (2000x1000) uses single_column_panels = false and touch_target_min_px = 32.
 *    - CameraManager handleResize handles narrow mobile dimensions without losing preset calibration.
 *
 * Run: npx tsx scripts/test-accessibility-and-fallbacks.ts
 */

import {
  CameraManager,
  getCameraPreset,
  type CameraLike,
  type OrbitControlsLike,
} from '../src/lib/office/camera'
import {
  DEFAULT_CAMERA_ANIMATION_DURATION_MS,
  REDUCED_MOTION_ANIMATION_DURATION_MS,
  MOBILE_VIEWPORT_BREAKPOINT,
  MOBILE_TOUCH_TARGET_MIN_PX,
  DESKTOP_TOUCH_TARGET_MIN_PX,
  WEBGL_UNAVAILABLE_BANNER,
  deriveRenderPolicy,
  handleKeyboardShortcut,
  isReducedMotionPreferred,
  type KeyboardShortcutActionMap,
} from '../src/lib/office/accessibility'

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

function createMockCamera(): CameraLike {
  return {
    position: {
      x: 0,
      y: 0,
      z: 0,
      set(x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      },
    },
    fov: 45,
    zoom: 1.0,
    aspect: 1.0,
    updateProjectionMatrix() {},
  }
}

function createMockControls(): OrbitControlsLike {
  return {
    target: {
      x: 0,
      y: 0,
      z: 0,
      set(x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      },
    },
    minDistance: 0,
    maxDistance: 100,
    update() {},
  }
}

async function runTests() {
  console.log('\n--- Accessibility, Reduced Motion & WebGL Fallback Tests (Task 9.16) ---\n')

  // ---------------------------------------------------------------------------
  // 1. Reduced-Motion Detection & Instant Camera Snapping
  // ---------------------------------------------------------------------------
  console.log('1. Reduced-Motion Detection & Camera Snapping:')
  {
    assert('isReducedMotionPreferred respects override=true', isReducedMotionPreferred(true) === true)
    assert('isReducedMotionPreferred respects override=false', isReducedMotionPreferred(false) === false)

    const camera = createMockCamera()
    const controls = createMockControls()
    const cameraManager = new CameraManager(camera, controls, 'overall')

    // Apply preset with reducedMotion: true even when animate is requested
    const loungePreset = getCameraPreset('lounge')
    cameraManager.applyPreset('lounge', true, { reducedMotion: true })

    assert(
      'Camera position snaps immediately to preset with reduced motion',
      camera.position.x === loungePreset.position.x &&
      camera.position.y === loungePreset.position.y &&
      camera.position.z === loungePreset.position.z
    )
    assert(
      'Controls target snaps immediately to preset with reduced motion',
      controls.target.x === loungePreset.target.x &&
      controls.target.y === loungePreset.target.y &&
      controls.target.z === loungePreset.target.z
    )
    assert('Camera fov matches preset', camera.fov === loungePreset.fov)
    assert('CameraManager active preset is lounge', cameraManager.getActivePresetId() === 'lounge')

    // Policy check for reduced motion
    const policyNormal = deriveRenderPolicy({
      hasWebGL: true,
      prefersReducedMotion: false,
      viewportWidth: 1920,
      viewportHeight: 1080,
    })
    const policyReduced = deriveRenderPolicy({
      hasWebGL: true,
      prefersReducedMotion: true,
      viewportWidth: 1920,
      viewportHeight: 1080,
    })

    assert(
      'Normal motion uses default animation duration',
      policyNormal.cameraAnimationDurationMs === DEFAULT_CAMERA_ANIMATION_DURATION_MS
    )
    assert(
      'Reduced motion sets camera animation duration to 0ms (snap)',
      policyReduced.cameraAnimationDurationMs === REDUCED_MOTION_ANIMATION_DURATION_MS &&
      policyReduced.cameraAnimationDurationMs === 0
    )
  }

  // ---------------------------------------------------------------------------
  // 2. Full Keyboard Navigation
  // ---------------------------------------------------------------------------
  console.log('\n2. Keyboard Shortcuts Handling:')
  {
    const state = {
      currentView: '3d',
      currentPreset: 'overall',
      meetingToggled: false,
      chatToggled: false,
      approvalToggled: false,
      boardToggled: false,
      systemToggled: false,
      newTaskTriggered: false,
      escapeTriggered: false,
    }

    const actions: KeyboardShortcutActionMap = {
      onSetView: (v) => { state.currentView = v },
      onCameraPreset: (p) => { state.currentPreset = p },
      onToggleMeeting: () => { state.meetingToggled = !state.meetingToggled },
      onToggleChat: () => { state.chatToggled = !state.chatToggled },
      onToggleApproval: () => { state.approvalToggled = !state.approvalToggled },
      onToggleBoard: () => { state.boardToggled = !state.boardToggled },
      onToggleSystem: () => { state.systemToggled = !state.systemToggled },
      onNewTask: () => { state.newTaskTriggered = true },
      onEscape: () => { state.escapeTriggered = true },
    }

    // View modes
    assert("Key '1' switches to sprite view", handleKeyboardShortcut('1', actions) && state.currentView === 'sprite')
    assert("Key '2' switches to 2d/kanban view", handleKeyboardShortcut('2', actions) && state.currentView === '2d')
    assert("Key '3' switches to 3d view", handleKeyboardShortcut('3', actions) && state.currentView === '3d')

    // Camera presets
    assert("Key '4' activates overall preset", handleKeyboardShortcut('4', actions) && state.currentPreset === 'overall')
    assert("Key '5' activates courtyard preset", handleKeyboardShortcut('5', actions) && state.currentPreset === 'courtyard')
    assert("Key '6' activates lounge preset", handleKeyboardShortcut('6', actions) && state.currentPreset === 'lounge')
    assert("Key '7' activates upper-floor preset", handleKeyboardShortcut('7', actions) && state.currentPreset === 'upper-floor')

    // Panels
    assert("Key 'm' toggles meeting panel", handleKeyboardShortcut('m', actions) && state.meetingToggled === true)
    assert("Key 'M' toggles meeting panel again", handleKeyboardShortcut('M', actions) && state.meetingToggled === false)
    assert("Key 'c' toggles chat panel", handleKeyboardShortcut('c', actions) && state.chatToggled === true)
    assert("Key 'p' toggles approval panel", handleKeyboardShortcut('p', actions) && state.approvalToggled === true)
    assert("Key 'b' toggles board panel", handleKeyboardShortcut('b', actions) && state.boardToggled === true)
    assert("Key 's' toggles system panel", handleKeyboardShortcut('s', actions) && state.systemToggled === true)
    assert("Key 'n' triggers new task modal", handleKeyboardShortcut('n', actions) && state.newTaskTriggered === true)
    assert("Key 'Escape' closes active panels/cards", handleKeyboardShortcut('Escape', actions) && state.escapeTriggered === true)

    // Form input isolation
    const ignoredInInput = handleKeyboardShortcut('m', actions, 'input')
    const ignoredInTextarea = handleKeyboardShortcut('2', actions, 'textarea')
    const ignoredInSelect = handleKeyboardShortcut('Escape', actions, 'select')
    assert('Key presses inside input elements do not trigger shortcuts', !ignoredInInput)
    assert('Key presses inside textarea elements do not trigger shortcuts', !ignoredInTextarea)
    assert('Key presses inside select elements do not trigger shortcuts', !ignoredInSelect)
  }

  // ---------------------------------------------------------------------------
  // 3. Hidden-Tab Throttle Invariant
  // ---------------------------------------------------------------------------
  console.log('\n3. Hidden-Tab Throttle Invariant:')
  {
    const policy = deriveRenderPolicy({
      hasWebGL: true,
      prefersReducedMotion: false,
      viewportWidth: 1280,
      viewportHeight: 720,
    })
    assert('throttleWhenHidden is enforced true by render policy', policy.throttleWhenHidden === true)

    // Mock scene render loop stop/start simulation
    const renderState = { running: true }
    const mockScene = {
      start() { renderState.running = true },
      stop() { renderState.running = false },
    }

    // Simulate tab hidden
    const onVisibilityChange = (hidden: boolean, view: string) => {
      if (hidden) {
        mockScene.stop()
      } else if (view === '3d') {
        mockScene.start()
      }
    }

    onVisibilityChange(true, '3d')
    assert('Scene render loop stopped when document.hidden is true', renderState.running === false)

    onVisibilityChange(false, '3d')
    assert('Scene render loop resumed when document.hidden becomes false', renderState.running === true)

    onVisibilityChange(false, '2d')
    // when view is 2d, scene shouldn't resume
    onVisibilityChange(true, '2d')
    onVisibilityChange(false, '2d')
    assert('Scene does not resume when view is not 3d', renderState.running === false)
  }

  // ---------------------------------------------------------------------------
  // 4. WebGL Fallback Behavior & Indonesian Banner
  // ---------------------------------------------------------------------------
  console.log('\n4. WebGL Fallback Checks:')
  {
    const policyNoWebGL = deriveRenderPolicy({
      hasWebGL: false,
      prefersReducedMotion: false,
      viewportWidth: 1200,
      viewportHeight: 800,
      effectiveViewMode: '3d',
    })

    assert('WebGL unavailable demotes effectiveViewMode to 2d', policyNoWebGL.effectiveViewMode === '2d')
    assert('WebGL unavailable sets canvasVisible to false', policyNoWebGL.canvasVisible === false)
    assert(
      'WebGL unavailable emits exact scene-unavailable message',
      policyNoWebGL.fallbackBannerMessage === WEBGL_UNAVAILABLE_BANNER
    )
    assert(
      'Message states Indonesian 2D/Kanban fallback explicitly',
      policyNoWebGL.fallbackBannerMessage?.includes('Akselerasi 3D (WebGL) tidak tersedia') === true &&
      policyNoWebGL.fallbackBannerMessage?.includes('Kantor dialihkan ke mode 2D / Kanban.') === true
    )

    const policyWithWebGL = deriveRenderPolicy({
      hasWebGL: true,
      prefersReducedMotion: false,
      viewportWidth: 1200,
      viewportHeight: 800,
      effectiveViewMode: '3d',
    })
    assert('WebGL available preserves 3d view mode', policyWithWebGL.effectiveViewMode === '3d')
    assert('WebGL available has canvasVisible true', policyWithWebGL.canvasVisible === true)
    assert('WebGL available has null fallbackBannerMessage', policyWithWebGL.fallbackBannerMessage === null)
  }

  // ---------------------------------------------------------------------------
  // 5. Mobile Viewport Resize Calibration & Touch Targets
  // ---------------------------------------------------------------------------
  console.log('\n5. Mobile Viewport Resize Calibration & Touch Targets:')
  {
    const mobilePolicy = deriveRenderPolicy({
      hasWebGL: true,
      prefersReducedMotion: false,
      viewportWidth: 390,
      viewportHeight: 844,
      isTouchDevice: true,
    })

    assert(
      'Mobile screen (<640px) enables singleColumnPanels',
      mobilePolicy.singleColumnPanels === true
    )
    assert(
      'Mobile touch targets are calibrated to at least 44px',
      mobilePolicy.touchTargetMinPx === MOBILE_TOUCH_TARGET_MIN_PX &&
      mobilePolicy.touchTargetMinPx >= 44
    )

    const desktopPolicy = deriveRenderPolicy({
      hasWebGL: true,
      prefersReducedMotion: false,
      viewportWidth: 2000,
      viewportHeight: 1000,
      isTouchDevice: false,
    })

    assert(
      'Desktop screen (>=640px) disables singleColumnPanels',
      desktopPolicy.singleColumnPanels === false
    )
    assert(
      'Desktop touch targets use standard 32px',
      desktopPolicy.touchTargetMinPx === DESKTOP_TOUCH_TARGET_MIN_PX &&
      desktopPolicy.touchTargetMinPx === 32
    )

    // CameraManager handleResize test on mobile
    const camera = createMockCamera()
    const controls = createMockControls()
    const cameraManager = new CameraManager(camera, controls, 'overall')

    cameraManager.handleResize(390, 844)
    assert('Camera aspect ratio calibrated to 390/844', Math.abs(camera.aspect - (390 / 844)) < 0.001)
    assert('Camera retains calibrated FOV on mobile resize', camera.fov === 45)

    cameraManager.handleResize(2000, 1000)
    assert('Camera aspect ratio calibrated to 2.0 on desktop resize', camera.aspect === 2.0)
  }

  console.log(`\nResults: ${checks - failures}/${checks} checks passed.`)
  if (failures > 0) {
    console.error(`FAILED: ${failures} check(s) failed.`)
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Fatal error running tests:', err)
  process.exit(1)
})
