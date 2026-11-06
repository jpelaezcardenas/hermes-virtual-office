/**
 * test-render-modes-and-safe-area.ts — 3D/Kanban/Sprite Render Modes, Fullscreen Panels,
 * Safe-Area Keyboard Handling & Mobile Toolbar Isolation Tests.
 *
 * Task 9.19 of bunker-virtual-office OpenSpec change.
 *
 * Verifies:
 * 1. 3D, Kanban, and Sprite modes transition cleanly:
 *    - All 3 render modes supported with proper labels and configurations.
 *    - 3D requires WebGL; 2D and Sprite are WebGL-free fallbacks.
 *    - All modes are inference-free by design.
 * 2. Mode switch is outside the scrolling mobile toolbar:
 *    - vp-topbar-view is strictly a sibling outside vp-topbar-nav.
 *    - On narrow viewports (<=1180px and <=720px), grid layout isolates view from nav.
 *    - Horizontally scrolling vp-topbar-nav does NOT hide or move vp-topbar-view.
 * 3. Switching between modes preserves task identities and triggers ZERO inference calls:
 *    - Task IDs and states preserved across all mode transitions.
 *    - Transitions strictly reject inference invocation attempts.
 * 4. Fullscreen panels adapt to virtual keyboard (visualViewport) and apply safe-area insets:
 *    - FullPanel tracks window.visualViewport height and offsetTop.
 *    - Sets --vp-vvh and --vp-vvtop on root element and cleans up.
 *    - CSS handles safe-area-inset-top, safe-area-inset-bottom, safe-area-inset-left, safe-area-inset-right.
 * 5. Keyboard shortcuts ('1', '2', '3') switch modes reliably:
 *    - '1' -> Sprite, '2' -> Kanban, '3' -> 3D.
 *    - Input, textarea, and select elements correctly bypass mode switching shortcuts.
 *
 * Run: npx tsx scripts/test-render-modes-and-safe-area.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  RENDER_MODES,
  RENDER_MODE_CONFIGS,
  transitionRenderMode,
  validateModeSwitchLayout,
  validateSafeAreaKeyboardSupport,
  type RenderMode,
} from '../src/lib/office/render-mode'
import type { Task } from '../src/types/hermes'

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
  console.log('\n--- 3D/Kanban/Sprite Render Modes, Fullscreen Panels & Safe-Area Keyboard Tests (Task 9.19) ---\n')

  // ---------------------------------------------------------------------------
  // 1. Render Modes Configuration & Availability
  // ---------------------------------------------------------------------------
  console.log('1. Render Modes Configuration & Capabilities:')
  {
    assert('RENDER_MODES contains exactly 3 modes', RENDER_MODES.length === 3)
    assert('3D mode is registered', RENDER_MODES.includes('3d'))
    assert('2D (Kanban) mode is registered', RENDER_MODES.includes('2d'))
    assert('Sprite mode is registered', RENDER_MODES.includes('sprite'))

    const cfg3d = RENDER_MODE_CONFIGS['3d']
    assert('3D mode label is "3D"', cfg3d.label === '3D')
    assert('3D mode shortcut is "3"', cfg3d.shortcutKey === '3')
    assert('3D requires WebGL', cfg3d.requiresWebGL === true)
    assert('3D is inference free', cfg3d.isInferenceFree === true)
    assert('3D supports fullscreen panels', cfg3d.isFullscreenPanelSupported === true)

    const cfg2d = RENDER_MODE_CONFIGS['2d']
    assert('2D mode label is "Kanban"', cfg2d.label === 'Kanban')
    assert('2D mode shortcut is "2"', cfg2d.shortcutKey === '2')
    assert('2D does not require WebGL', cfg2d.requiresWebGL === false)
    assert('2D is inference free', cfg2d.isInferenceFree === true)
    assert('2D supports fullscreen panels', cfg2d.isFullscreenPanelSupported === true)

    const cfgSprite = RENDER_MODE_CONFIGS['sprite']
    assert('Sprite mode label is "Sprite"', cfgSprite.label === 'Sprite')
    assert('Sprite mode shortcut is "1"', cfgSprite.shortcutKey === '1')
    assert('Sprite does not require WebGL', cfgSprite.requiresWebGL === false)
    assert('Sprite is inference free', cfgSprite.isInferenceFree === true)
    assert('Sprite supports fullscreen panels', cfgSprite.isFullscreenPanelSupported === true)
  }

  // ---------------------------------------------------------------------------
  // 2. Mode Transitions & Task Identity Preservation (Zero Inference)
  // ---------------------------------------------------------------------------
  console.log('\n2. Mode Transitions & Invariants (Task Identity & Zero Inference):')
  {
    const sampleTasks: Task[] = [
      {
        id: 'task-hermes-001',
        title: 'Calibrate neural telemetry',
        status: 'running',
        assignee: 'hera',
        priority: 1,
      },
      {
        id: 'task-hermes-002',
        title: 'Review executive sign-off',
        status: 'review',
        assignee: 'zeus',
        priority: 2,
      },
      {
        id: 'task-hermes-003',
        title: 'Archived legacy audit',
        status: 'archived',
        assignee: null,
        priority: 3,
      },
    ]

    // 3D -> Kanban
    const t1 = transitionRenderMode('3d', '2d', sampleTasks)
    assert('Transition 3D -> Kanban succeeds', t1.success === true)
    assert('Task count preserved (3 tasks)', t1.preservedTaskCount === 3)
    assert('Task IDs matched exactly', JSON.stringify(t1.preservedTaskIds) === JSON.stringify(['task-hermes-001', 'task-hermes-002', 'task-hermes-003']))
    assert('Inference strictly not invoked', t1.inferenceInvoked === false)
    assert('No failure reason', t1.failureReason === undefined)

    // Kanban -> Sprite
    const t2 = transitionRenderMode('2d', 'sprite', sampleTasks)
    assert('Transition Kanban -> Sprite succeeds', t2.success === true)
    assert('Inference strictly not invoked', t2.inferenceInvoked === false)
    assert('Task IDs preserved into Sprite mode', t2.preservedTaskCount === 3)

    // Sprite -> 3D
    const t3 = transitionRenderMode('sprite', '3d', sampleTasks)
    assert('Transition Sprite -> 3D succeeds', t3.success === true)
    assert('Inference strictly not invoked', t3.inferenceInvoked === false)
    assert('Task IDs preserved back into 3D mode', t3.preservedTaskCount === 3)

    // Attempted inference during mode transition MUST be rejected
    const tInference = transitionRenderMode('3d', 'sprite', sampleTasks, { attemptInference: true })
    assert('Transition with inference attempt is rejected', tInference.success === false)
    assert('Inference remains false even on attempt', tInference.inferenceInvoked === false)
    assert('Failure reason explains prohibition', tInference.failureReason === 'inference_prohibited_during_render_transition')

    // Invalid mode transitions
    const tBadSource = transitionRenderMode('hologram', '3d', sampleTasks)
    assert('Transition from invalid mode rejected', tBadSource.success === false)
    assert('Reports invalid source mode', tBadSource.failureReason === 'invalid_source_mode_hologram')

    const tBadTarget = transitionRenderMode('3d', 'matrix', sampleTasks)
    assert('Transition to invalid mode rejected', tBadTarget.success === false)
    assert('Reports invalid target mode', tBadTarget.failureReason === 'invalid_target_mode_matrix')
  }

  // ---------------------------------------------------------------------------
  // 3. Mode Switch Isolated Outside Scrolling Mobile Toolbar
  // ---------------------------------------------------------------------------
  console.log('\n3. Mobile Toolbar Isolation Verification:')
  {
    const officeAppPath = path.resolve(__dirname, '../src/components/OfficeApp.tsx')
    const globalsCssPath = path.resolve(__dirname, '../src/app/globals.css')

    const officeAppCode = fs.readFileSync(officeAppPath, 'utf8')
    const globalsCssCode = fs.readFileSync(globalsCssPath, 'utf8')

    // Verify OfficeApp.tsx structure:
    // <nav className="vp-topbar-nav ..."> ... </nav>
    // followed outside by <div className="... vp-topbar-view ...">
    const navIndex = officeAppCode.indexOf('vp-topbar-nav')
    const navCloseIndex = officeAppCode.indexOf('</nav>', navIndex)
    const viewIndex = officeAppCode.indexOf('vp-topbar-view')

    assert('vp-topbar-nav exists in OfficeApp', navIndex !== -1)
    assert('vp-topbar-view exists in OfficeApp', viewIndex !== -1)
    assert('vp-topbar-view is placed AFTER </nav> closing tag', viewIndex > navCloseIndex)

    // Verify layout verification function with actual component source
    const layoutVerification = validateModeSwitchLayout(officeAppCode)
    assert('Layout verification confirms isOutsideNav', layoutVerification.isOutsideNav === true)
    assert('Layout verification confirms isReachableOnMobileScroll', layoutVerification.isReachableOnMobileScroll === true)
    assert('Layout verification confirms modeSwitchIsolated', layoutVerification.modeSwitchIsolated === true)

    // Verify globals.css mobile toolbar scrolling and grid isolation
    const hasNavScroll = globalsCssCode.includes('.vp-topbar-nav') && globalsCssCode.includes('overflow-x: auto')
    assert('CSS enables horizontal scrolling for mobile toolbar (.vp-topbar-nav overflow-x: auto)', hasNavScroll)

    const hasDedicatedGrid = globalsCssCode.includes("grid-template-areas: 'brand view' 'nav nav'")
    assert('CSS reserves dedicated view area in grid on narrow screens', hasDedicatedGrid)

    const hasViewGridArea = globalsCssCode.includes('.vp-topbar-view { grid-area: view; }')
    assert('CSS anchors .vp-topbar-view to dedicated view grid area', hasViewGridArea)
  }

  // ---------------------------------------------------------------------------
  // 4. Fullscreen Panels & Safe-Area Virtual Keyboard Accommodation
  // ---------------------------------------------------------------------------
  console.log('\n4. Fullscreen Panels Safe-Area & Virtual Keyboard Handling:')
  {
    const fullPanelPath = path.resolve(__dirname, '../src/components/FullPanel.tsx')
    const globalsCssPath = path.resolve(__dirname, '../src/app/globals.css')

    const fullPanelCode = fs.readFileSync(fullPanelPath, 'utf8')
    const globalsCssCode = fs.readFileSync(globalsCssPath, 'utf8')

    // Check FullPanel.tsx visualViewport event handling
    assert('FullPanel reads window.visualViewport', fullPanelCode.includes('window.visualViewport'))
    assert('FullPanel sets --vp-vvh custom property', fullPanelCode.includes("--vp-vvh"))
    assert('FullPanel sets --vp-vvtop custom property', fullPanelCode.includes("--vp-vvtop"))
    assert('FullPanel listens for visualViewport resize event', fullPanelCode.includes("vv?.addEventListener('resize'"))
    assert('FullPanel listens for visualViewport scroll event', fullPanelCode.includes("vv?.addEventListener('scroll'"))
    assert('FullPanel cleans up visualViewport listeners on unmount', fullPanelCode.includes("vv?.removeEventListener('resize'"))

    // Check globals.css safe-area and visual viewport rules
    const hasVvhHeight = globalsCssCode.includes('height: var(--vp-vvh, 100dvh);')
    assert('CSS sets .vp-full height from --vp-vvh with 100dvh fallback', hasVvhHeight)

    const hasVvtop = globalsCssCode.includes('top: var(--vp-vvtop, 0px);')
    assert('CSS sets .vp-full top from --vp-vvtop', hasVvtop)

    const hasSafeAreaTop = globalsCssCode.includes('env(safe-area-inset-top)')
    assert('CSS respects safe-area-inset-top in headers', hasSafeAreaTop)

    const hasSafeAreaBottom = globalsCssCode.includes('env(safe-area-inset-bottom)')
    assert('CSS respects safe-area-inset-bottom in fullscreen cards & banners', hasSafeAreaBottom)

    const hasSafeAreaLeftRight = globalsCssCode.includes('env(safe-area-inset-left)') && globalsCssCode.includes('env(safe-area-inset-right)')
    assert('CSS respects safe-area-inset-left and safe-area-inset-right', hasSafeAreaLeftRight)

    // Verify helper
    const safeAreaCheck = validateSafeAreaKeyboardSupport(720, { top: 44, bottom: 34, left: 0, right: 0 })
    assert('Helper validates visual viewport and safe-area insets', safeAreaCheck.keyboardAvoidanceSupported === true)
  }

  // ---------------------------------------------------------------------------
  // 5. Keyboard Shortcuts for Mode Switching
  // ---------------------------------------------------------------------------
  console.log('\n5. Keyboard Shortcuts for Mode Switching:')
  {
    const officeAppPath = path.resolve(__dirname, '../src/components/OfficeApp.tsx')
    const officeAppCode = fs.readFileSync(officeAppPath, 'utf8')

    // Check key '1' -> 'sprite', '2' -> '2d', '3' -> '3d'
    const hasKey1 = officeAppCode.includes("e.key === '1'") && officeAppCode.includes("setView('sprite')")
    assert("Key '1' triggers setView('sprite')", hasKey1)

    const hasKey2 = officeAppCode.includes("e.key === '2'") && officeAppCode.includes("setView('2d')")
    assert("Key '2' triggers setView('2d')", hasKey2)

    const hasKey3 = officeAppCode.includes("e.key === '3'") && officeAppCode.includes("setView('3d')")
    assert("Key '3' triggers setView('3d')", hasKey3)

    // Check that form input tags bypass shortcuts
    const inputBypass = officeAppCode.includes("tag === 'input' || tag === 'textarea' || tag === 'select'")
    assert('Input, textarea, and select elements bypass keyboard shortcuts', inputBypass)
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\nResults: ${checks} checks passed, ${failures} failures\n`)
  if (failures > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Test script crashed:', err)
  process.exit(1)
})
