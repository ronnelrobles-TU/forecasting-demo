import { describe, it, expect } from 'vitest'
import {
  makeJourney,
  tickJourney,
  transitionJourney,
  startWalkToRoom,
  startWalkBackToDesk,
  journeyPosition,
  isRestingPhase,
  isWalkingPhase,
  isAtBreakTable,
  WALK_DURATION_MS,
  LUNCH_WALK_DURATION_MS,
  MIN_BREAK_HOLD_MS,
  MIN_LUNCH_OUT_MS,
  MIN_RESTROOM_HOLD_MS,
  RESTROOM_FADE_MS,
  type VisualJourney,
} from '@/app/components/cockpit/agents/themes/isoOffice/journey'
import { computeBuildingLayout } from '@/app/components/cockpit/agents/themes/isoOffice/geometry'

const layout = computeBuildingLayout(50)
const desk = layout.deskPositions[0]
const door = layout.rooms.reception.doorPosition

function makeBaseline(t = 0): VisualJourney {
  return makeJourney('A0', desk, 'idle', t)
}

describe('makeJourney', () => {
  it('starts agents in at_desk phase by default', () => {
    const j = makeBaseline(0)
    expect(j.phase.kind).toBe('at_desk')
    expect(j.pendingSimState).toBeNull()
  })

  it('starts on_call agents in on_call_at_desk', () => {
    const j = makeJourney('A0', desk, 'on_call', 0)
    expect(j.phase.kind).toBe('on_call_at_desk')
  })

  it('starts off_shift agents in gone', () => {
    const j = makeJourney('A0', desk, 'off_shift', 0)
    expect(j.phase.kind).toBe('gone')
  })
})

describe('isRestingPhase', () => {
  it('at_desk / on_call_at_desk / gone are always resting', () => {
    expect(isRestingPhase({ kind: 'at_desk', pos: desk }, 0)).toBe(true)
    expect(isRestingPhase({ kind: 'on_call_at_desk', pos: desk }, 0)).toBe(true)
    expect(isRestingPhase({ kind: 'gone' }, 0)).toBe(true)
  })

  it('walking phases are never resting', () => {
    expect(isRestingPhase({
      kind: 'walking_to_break', from: desk, to: desk, duration: 1000, seat: desk,
    }, 999)).toBe(false)
  })

  it('at_break_table only rests after the min hold time', () => {
    const phase = { kind: 'at_break_table' as const, pos: desk, until: 5000 }
    expect(isRestingPhase(phase, 4999)).toBe(false)
    expect(isRestingPhase(phase, 5000)).toBe(true)
  })
})

describe('transitionJourney - defer-while-in-flight', () => {
  it('defers state change when journey is mid-walk', () => {
    let j = makeBaseline(0)
    j = transitionJourney(j, 'on_break', layout, 100, 5)
    expect(j.phase.kind).toBe('walking_to_break')

    // Mid-walk: try to flip back to idle. Should DEFER, not switch.
    const before = j.phase
    j = transitionJourney(j, 'idle', layout, 500)
    expect(j.phase).toBe(before)
    expect(j.pendingSimState).toBe('idle')
  })

  it('applies state change when journey is at a resting phase', () => {
    let j = makeBaseline(0)
    j = transitionJourney(j, 'on_break', layout, 100, 5) // coffee break
    expect(j.phase.kind).toBe('walking_to_break')
  })

  it('coffee break (<=20 min) routes to walking_to_break', () => {
    let j = makeBaseline(0)
    j = transitionJourney(j, 'on_break', layout, 100, 15)
    expect(j.phase.kind).toBe('walking_to_break')
  })

  it('long break (>20 min) becomes lunch — walks to door', () => {
    let j = makeBaseline(0)
    j = transitionJourney(j, 'on_break', layout, 100, 30)
    expect(j.phase.kind).toBe('walking_to_door_for_lunch')
    if (j.phase.kind === 'walking_to_door_for_lunch') {
      expect(j.phase.to).toEqual(door)
    }
  })

  it('off_shift triggers walking_to_door_for_shift_end', () => {
    let j = makeBaseline(0)
    j = transitionJourney(j, 'off_shift', layout, 100)
    expect(j.phase.kind).toBe('walking_to_door_for_shift_end')
  })
})

describe('tickJourney - in-flight phase transitions', () => {
  it('walking_to_break -> at_break_table when duration elapses', () => {
    let j = makeBaseline(0)
    j = transitionJourney(j, 'on_break', layout, 100, 5)
    expect(j.phase.kind).toBe('walking_to_break')
    j = tickJourney(j, layout, 100 + WALK_DURATION_MS + 1)
    expect(j.phase.kind).toBe('at_break_table')
  })

  it('at_break_table holds for at least MIN_BREAK_HOLD_MS', () => {
    let j = makeBaseline(0)
    j = transitionJourney(j, 'on_break', layout, 0, 5)
    j = tickJourney(j, layout, WALK_DURATION_MS + 1)
    expect(j.phase.kind).toBe('at_break_table')
    // Sim flips back to idle right away (the bug we're fixing).
    j = transitionJourney(j, 'idle', layout, WALK_DURATION_MS + 50)
    // Still seated — pending state is queued.
    expect(j.phase.kind).toBe('at_break_table')
    expect(j.pendingSimState).toBe('idle')
    // Tick well within the min-hold window: still seated.
    j = tickJourney(j, layout, WALK_DURATION_MS + 100)
    expect(j.phase.kind).toBe('at_break_table')
  })

  it('at_break_table -> walking_back_to_desk after min hold + pending change', () => {
    let j = makeBaseline(0)
    j = transitionJourney(j, 'on_break', layout, 0, 5)
    j = tickJourney(j, layout, WALK_DURATION_MS + 1)
    j = transitionJourney(j, 'idle', layout, WALK_DURATION_MS + 50)
    // After min hold completes, the pending idle should kick in.
    j = tickJourney(j, layout, WALK_DURATION_MS + MIN_BREAK_HOLD_MS + 100)
    expect(j.phase.kind).toBe('walking_back_to_desk')
  })

  it('walking_back_to_desk -> at_desk when duration elapses', () => {
    let j = makeBaseline(0)
    j = transitionJourney(j, 'on_break', layout, 0, 5)
    j = tickJourney(j, layout, WALK_DURATION_MS + 1)
    j = transitionJourney(j, 'idle', layout, WALK_DURATION_MS + 50)
    j = tickJourney(j, layout, WALK_DURATION_MS + MIN_BREAK_HOLD_MS + 100)
    // Now finish walk back.
    const t2 = (WALK_DURATION_MS + MIN_BREAK_HOLD_MS + 100) + WALK_DURATION_MS + 1
    j = tickJourney(j, layout, t2)
    expect(j.phase.kind).toBe('at_desk')
  })

  it('lunch sequence: walk-out, hold outside, walk-back', () => {
    let j = makeBaseline(0)
    j = transitionJourney(j, 'on_break', layout, 0, 30)  // lunch
    expect(j.phase.kind).toBe('walking_to_door_for_lunch')
    j = tickJourney(j, layout, LUNCH_WALK_DURATION_MS + 1)
    expect(j.phase.kind).toBe('outside_for_lunch')
    // Sim says still on break — agent stays outside.
    j = tickJourney(j, layout, LUNCH_WALK_DURATION_MS + 100)
    expect(j.phase.kind).toBe('outside_for_lunch')
    // Now sim flips to idle while still outside.
    j = transitionJourney(j, 'idle', layout, LUNCH_WALK_DURATION_MS + 200)
    expect(j.phase.kind).toBe('outside_for_lunch')
    expect(j.pendingSimState).toBe('idle')
    // After min lunch out time, walk back from lunch begins.
    j = tickJourney(j, layout, LUNCH_WALK_DURATION_MS + MIN_LUNCH_OUT_MS + 50)
    expect(j.phase.kind).toBe('walking_back_from_lunch')
  })

  it('shift_end walk -> gone', () => {
    let j = makeBaseline(0)
    j = transitionJourney(j, 'off_shift', layout, 0)
    expect(j.phase.kind).toBe('walking_to_door_for_shift_end')
    j = tickJourney(j, layout, LUNCH_WALK_DURATION_MS + 1)
    expect(j.phase.kind).toBe('gone')
  })
})

describe('journeyPosition', () => {
  it('returns desk position when at_desk', () => {
    const j = makeBaseline(0)
    const r = journeyPosition(j, 100)
    expect(r.pos).toEqual(desk)
    expect(r.opacity).toBe(1)
    expect(r.visible).toBe(true)
  })

  it('lerps along walking_to_break trajectory', () => {
    let j = makeBaseline(0)
    j = transitionJourney(j, 'on_break', layout, 0, 5)
    expect(j.phase.kind).toBe('walking_to_break')
    const at0 = journeyPosition(j, 0)
    const atMid = journeyPosition(j, WALK_DURATION_MS / 2)
    const atEnd = journeyPosition(j, WALK_DURATION_MS)
    if (j.phase.kind === 'walking_to_break') {
      expect(at0.pos.x).toBeCloseTo(j.phase.from.x, 1)
      expect(atEnd.pos.x).toBeCloseTo(j.phase.to.x, 1)
      const expectedMidX = (j.phase.from.x + j.phase.to.x) / 2
      expect(atMid.pos.x).toBeCloseTo(expectedMidX, 1)
    }
  })

  it('outside_for_lunch is invisible (opacity 0)', () => {
    let j = makeBaseline(0)
    j = transitionJourney(j, 'on_break', layout, 0, 30)
    j = tickJourney(j, layout, LUNCH_WALK_DURATION_MS + 1)
    const r = journeyPosition(j, LUNCH_WALK_DURATION_MS + 100)
    expect(r.opacity).toBe(0)
    expect(r.visible).toBe(false)
  })

  it('walking_to_door_for_shift_end fades to 0 in the last 30%', () => {
    let j = makeBaseline(0)
    j = transitionJourney(j, 'off_shift', layout, 0)
    const at60pct = journeyPosition(j, LUNCH_WALK_DURATION_MS * 0.6)
    const at95pct = journeyPosition(j, LUNCH_WALK_DURATION_MS * 0.95)
    expect(at60pct.opacity).toBe(1)
    expect(at95pct.opacity).toBeLessThan(0.5)
  })
})

describe('isWalkingPhase / isAtBreakTable helpers', () => {
  it('isWalkingPhase recognizes all walking variants', () => {
    expect(isWalkingPhase({ kind: 'walking_to_break', from: desk, to: desk, duration: 1, seat: desk })).toBe(true)
    expect(isWalkingPhase({ kind: 'walking_back_to_desk', from: desk, to: desk, duration: 1 })).toBe(true)
    expect(isWalkingPhase({ kind: 'walking_to_door_for_lunch', from: desk, to: desk, duration: 1 })).toBe(true)
    expect(isWalkingPhase({ kind: 'at_desk', pos: desk })).toBe(false)
  })

  it('isAtBreakTable detects at_break_table only', () => {
    expect(isAtBreakTable({ kind: 'at_break_table', pos: desk, until: 0 })).toBe(true)
    expect(isAtBreakTable({ kind: 'at_desk', pos: desk })).toBe(false)
  })
})

describe('Round 4: restroom 5-phase visible journey', () => {
  const restroomDoor = layout.rooms.restrooms.doorPositions[0]
  it('walks to door -> fades out at door -> hidden -> fades in -> walks back', () => {
    let j = makeJourney('A0', desk, 'idle', 0)
    // Dispatch the restroom walk.
    j = startWalkToRoom(j, 'restroom', restroomDoor, 0)
    expect(j.phase.kind).toBe('walking_to_restroom_door')

    // Walk completes -> entering_restroom (fade out).
    j = tickJourney(j, layout, WALK_DURATION_MS + 1)
    expect(j.phase.kind).toBe('entering_restroom')

    // Fade duration elapses -> inside_restroom.
    j = tickJourney(j, layout, WALK_DURATION_MS + RESTROOM_FADE_MS + 5)
    expect(j.phase.kind).toBe('inside_restroom')
    // Hidden — opacity 0.
    const hidden = journeyPosition(j, WALK_DURATION_MS + RESTROOM_FADE_MS + 100)
    expect(hidden.opacity).toBe(0)
    expect(hidden.visible).toBe(false)

    // Min restroom hold elapses -> exiting_restroom.
    const tHold = WALK_DURATION_MS + RESTROOM_FADE_MS + MIN_RESTROOM_HOLD_MS + 50
    j = tickJourney(j, layout, tHold)
    expect(j.phase.kind).toBe('exiting_restroom')

    // Fade-in completes -> walking back to desk.
    j = tickJourney(j, layout, tHold + RESTROOM_FADE_MS + 5)
    expect(j.phase.kind).toBe('walking_back_from_restroom')

    // Walk completes -> at_desk.
    j = tickJourney(j, layout, tHold + RESTROOM_FADE_MS + WALK_DURATION_MS + 10)
    expect(j.phase.kind).toBe('at_desk')
  })

  it('entering_restroom interpolates opacity from 1 -> 0', () => {
    let j = makeJourney('A0', desk, 'idle', 0)
    j = startWalkToRoom(j, 'restroom', restroomDoor, 0)
    j = tickJourney(j, layout, WALK_DURATION_MS + 1)
    expect(j.phase.kind).toBe('entering_restroom')
    const start = journeyPosition(j, WALK_DURATION_MS + 1)
    const half = journeyPosition(j, WALK_DURATION_MS + 1 + RESTROOM_FADE_MS / 2)
    expect(start.opacity).toBeCloseTo(1, 1)
    expect(half.opacity).toBeCloseTo(0.5, 1)
  })
})

describe('Round 4: chat walks (no teleport)', () => {
  it('startWalkToRoom chat -> walking_to_chat_spot -> at_chat_spot -> walking_back_from_chat', () => {
    const chatSpot = { x: 100, y: 100 }
    let j = makeJourney('A0', desk, 'idle', 0)
    j = startWalkToRoom(j, 'chat', chatSpot, 0)
    expect(j.phase.kind).toBe('walking_to_chat_spot')

    j = tickJourney(j, layout, WALK_DURATION_MS + 1)
    expect(j.phase.kind).toBe('at_chat_spot')

    // Walk back triggered by startWalkBackToDesk after the agent settles.
    const tBack = WALK_DURATION_MS + 1 + 5000
    // Mark pending so the at_chat_spot tick triggers the walk-back.
    j = { ...j, pendingSimState: 'on_call' }
    j = tickJourney(j, layout, tBack)
    expect(j.phase.kind).toBe('walking_back_from_chat')
  })

  it('startWalkBackToDesk from in_room phase walks back from the room pos (no teleport)', () => {
    const gymPos = { x: 50, y: 50 }
    let j = makeJourney('A0', desk, 'idle', 0)
    j = startWalkToRoom(j, 'gym', gymPos, 0)
    j = tickJourney(j, layout, WALK_DURATION_MS + 1)
    expect(j.phase.kind).toBe('in_room')

    j = startWalkBackToDesk(j, WALK_DURATION_MS + 100)
    expect(j.phase.kind).toBe('walking_back_from_room')
    if (j.phase.kind === 'walking_back_from_room') {
      // Walk source must be the gym position, NOT the door / origin.
      expect(j.phase.from).toEqual(gymPos)
    }
  })

  it('lastKnownPosition is updated as walks complete', () => {
    const gymPos = { x: 50, y: 50 }
    let j = makeJourney('A0', desk, 'idle', 0)
    expect(j.lastKnownPosition).toEqual(desk)
    j = startWalkToRoom(j, 'gym', gymPos, 0)
    // Walk reaches gym.
    j = tickJourney(j, layout, WALK_DURATION_MS + 1)
    expect(j.phase.kind).toBe('in_room')
    // lastKnownPosition should now reflect the arrival point.
    expect(j.lastKnownPosition.x).toBeCloseTo(gymPos.x, 0)
    expect(j.lastKnownPosition.y).toBeCloseTo(gymPos.y, 0)
  })
})

describe('integration: full break narrative under fast sim', () => {
  it('completes walk-sit-walk even when sim flips back instantly', () => {
    // Simulate the user-reported bug: 30-min break passes in 1.3 real seconds.
    let j = makeBaseline(0)

    // t=0: sim says "on break, 30 min" (lunch)
    j = transitionJourney(j, 'on_break', layout, 0, 30)
    expect(j.phase.kind).toBe('walking_to_door_for_lunch')

    // t=200: sim flips back to idle (instant). Should DEFER.
    j = transitionJourney(j, 'idle', layout, 200)
    expect(j.phase.kind).toBe('walking_to_door_for_lunch')
    expect(j.pendingSimState).toBe('idle')

    // t=2100: walk to door completes -> outside_for_lunch
    j = tickJourney(j, layout, LUNCH_WALK_DURATION_MS + 100)
    expect(j.phase.kind).toBe('outside_for_lunch')

    // t=6200: min lunch out elapsed; pending idle now applied
    j = tickJourney(j, layout, LUNCH_WALK_DURATION_MS + MIN_LUNCH_OUT_MS + 200)
    expect(j.phase.kind).toBe('walking_back_from_lunch')

    // t=8300: walk-back completes -> at_desk
    const t = (LUNCH_WALK_DURATION_MS + MIN_LUNCH_OUT_MS + 200) + LUNCH_WALK_DURATION_MS + 100
    j = tickJourney(j, layout, t)
    expect(j.phase.kind).toBe('at_desk')
  })
})
