import { describe, it, expect } from 'vitest'
import {
  computeBuildingLayout,
  isoToScreen,
  TILE_W,
  TILE_H,
  type IsoBounds,
  type ScreenPoint,
} from '@/app/components/cockpit/agents/themes/isoOffice/geometry'

function pointInPoly(p: ScreenPoint, poly: ScreenPoint[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y
    const xj = poly[j].x, yj = poly[j].y
    const intersect = ((yi > p.y) !== (yj > p.y)) &&
      (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

describe('isoToScreen', () => {
  it('maps (0,0) to provided origin', () => {
    expect(isoToScreen(0, 0, 250, 50)).toEqual({ x: 250, y: 50 })
  })
  it('moves +i: x and y both increase by half tile', () => {
    expect(isoToScreen(1, 0, 0, 0)).toEqual({ x: TILE_W / 2, y: TILE_H / 2 })
  })
  it('moves +j: x decreases, y increases', () => {
    expect(isoToScreen(0, 1, 0, 0)).toEqual({ x: -TILE_W / 2, y: TILE_H / 2 })
  })
})

function rectsOverlap(a: IsoBounds, b: IsoBounds): boolean {
  // Strict overlap: shared interior area > 0. Touching edges don't count.
  return (
    a.iMin < b.iMax && b.iMin < a.iMax &&
    a.jMin < b.jMax && b.jMin < a.jMax
  )
}

describe('computeBuildingLayout', () => {
  it('building grows with agent count', () => {
    const small = computeBuildingLayout(6)
    const big = computeBuildingLayout(200)
    expect(big.tilesW).toBeGreaterThan(small.tilesW)
    expect(big.tilesD).toBeGreaterThanOrEqual(small.tilesD)
  })

  it('viewBox grows with building', () => {
    const small = computeBuildingLayout(6)
    const big = computeBuildingLayout(200)
    expect(big.viewBox.w).toBeGreaterThan(small.viewBox.w)
    expect(big.viewBox.h).toBeGreaterThan(small.viewBox.h)
  })

  it('places one desk per agent (no silent drop) up to pod capacity', () => {
    for (const n of [1, 4, 8, 12, 30, 60, 100, 150, 200, 500]) {
      const layout = computeBuildingLayout(n)
      expect(layout.deskPositions.length).toBe(n)
    }
  })

  it('pod count = ceil(agentCount / 4) for non-trivial agent counts', () => {
    for (const n of [4, 8, 12, 16, 30, 100, 150, 200]) {
      const layout = computeBuildingLayout(n)
      expect(layout.rooms.agentFloor.pods.length).toBe(Math.ceil(n / 4))
    }
  })

  it('total desks across pods >= agentCount', () => {
    for (const n of [1, 4, 50, 150, 200, 500]) {
      const layout = computeBuildingLayout(n)
      const totalDesks = layout.rooms.agentFloor.pods.reduce(
        (sum, p) => sum + p.desks.length,
        0,
      )
      expect(totalDesks).toBeGreaterThanOrEqual(n)
    }
  })

  it('every cubicle pod has exactly 4 desks and 4 partition walls', () => {
    const layout = computeBuildingLayout(150)
    for (const pod of layout.rooms.agentFloor.pods) {
      expect(pod.desks.length).toBe(4)
      expect(pod.partitionWalls.length).toBe(4)
    }
  })

  it('manager office count scales as max(2, ceil(agentCount/35))', () => {
    expect(computeBuildingLayout(1).rooms.managerOffices.length).toBe(2)
    expect(computeBuildingLayout(35).rooms.managerOffices.length).toBe(2)
    expect(computeBuildingLayout(36).rooms.managerOffices.length).toBe(2) // ceil(36/35)=2
    expect(computeBuildingLayout(70).rooms.managerOffices.length).toBe(2) // ceil(70/35)=2
    expect(computeBuildingLayout(71).rooms.managerOffices.length).toBe(3) // ceil(71/35)=3
    expect(computeBuildingLayout(150).rooms.managerOffices.length).toBe(Math.max(2, Math.ceil(150 / 35))) // 5
    expect(computeBuildingLayout(500).rooms.managerOffices.length).toBeLessThanOrEqual(6) // capped
  })

  it('each manager office has desk, manager, door, whiteboard positions', () => {
    const layout = computeBuildingLayout(150)
    for (const o of layout.rooms.managerOffices) {
      expect(o.deskPosition).toBeDefined()
      expect(o.managerPosition).toBeDefined()
      expect(o.doorPosition).toBeDefined()
      expect(o.whiteboardPosition).toBeDefined()
    }
  })

  it('reception has door, security desk, guard positions', () => {
    const layout = computeBuildingLayout(50)
    expect(layout.rooms.reception.doorPosition).toBeDefined()
    expect(layout.rooms.reception.securityDeskPosition).toBeDefined()
    expect(layout.rooms.reception.guardPosition).toBeDefined()
    expect(layout.rooms.reception.doorWidth).toBeGreaterThan(0)
  })

  it('break room has table, water cooler, vending machine, and seats', () => {
    const layout = computeBuildingLayout(100)
    expect(layout.rooms.breakRoom.tableCenter).toBeDefined()
    expect(layout.rooms.breakRoom.waterCoolerPosition).toBeDefined()
    expect(layout.rooms.breakRoom.vendingMachinePosition).toBeDefined()
    expect(layout.rooms.breakRoom.seatPositions.length).toBeGreaterThanOrEqual(8)
  })

  it('break room seat count grows with agent count', () => {
    expect(computeBuildingLayout(6).rooms.breakRoom.seatPositions.length).toBeGreaterThanOrEqual(8)
    expect(computeBuildingLayout(200).rooms.breakRoom.seatPositions.length).toBeGreaterThanOrEqual(50)
  })

  it('training room has whiteboard and student seats', () => {
    const layout = computeBuildingLayout(50)
    expect(layout.rooms.trainingRoom.whiteboardPosition).toBeDefined()
    expect(layout.rooms.trainingRoom.studentSeats.length).toBeGreaterThan(0)
  })

  it('restrooms have exactly 2 doors (M, F)', () => {
    const layout = computeBuildingLayout(50)
    expect(layout.rooms.restrooms.doorPositions.length).toBe(2)
  })

  it('gym has treadmill and weights', () => {
    const layout = computeBuildingLayout(50)
    expect(layout.rooms.gym.treadmillPosition).toBeDefined()
    expect(layout.rooms.gym.weightsPosition).toBeDefined()
  })

  it('windowsPerWall grows with building size', () => {
    const small = computeBuildingLayout(6)
    const big = computeBuildingLayout(200)
    expect(big.windowsPerWall).toBeGreaterThanOrEqual(small.windowsPerWall)
  })

  it('all rooms have non-overlapping iso bounds', () => {
    const layout = computeBuildingLayout(150)
    const allRooms: Array<{ name: string; bounds: IsoBounds }> = [
      { name: 'reception', bounds: layout.rooms.reception.isoBounds },
      { name: 'agentFloor', bounds: layout.rooms.agentFloor.isoBounds },
      { name: 'breakRoom', bounds: layout.rooms.breakRoom.isoBounds },
      { name: 'trainingRoom', bounds: layout.rooms.trainingRoom.isoBounds },
      { name: 'restrooms', bounds: layout.rooms.restrooms.isoBounds },
      { name: 'gym', bounds: layout.rooms.gym.isoBounds },
      ...layout.rooms.managerOffices.map((o, i) => ({
        name: `managerOffice-${i}`,
        bounds: o.isoBounds,
      })),
    ]
    for (let a = 0; a < allRooms.length; a++) {
      for (let b = a + 1; b < allRooms.length; b++) {
        expect(
          rectsOverlap(allRooms[a].bounds, allRooms[b].bounds),
          `${allRooms[a].name} overlaps ${allRooms[b].name}`,
        ).toBe(false)
      }
    }
  })

  // Round-2 bug-fix invariants.
  it('water cooler iso anchor falls inside the break-room polygon', () => {
    const layout = computeBuildingLayout(150)
    expect(pointInPoly(layout.rooms.breakRoom.waterCoolerPosition, layout.rooms.breakRoom.zonePoints)).toBe(true)
  })

  it('vending machine iso anchor falls inside the break-room polygon', () => {
    const layout = computeBuildingLayout(150)
    expect(pointInPoly(layout.rooms.breakRoom.vendingMachinePosition, layout.rooms.breakRoom.zonePoints)).toBe(true)
  })

  it('vending machine is NOT inside the training room polygon (regression)', () => {
    const layout = computeBuildingLayout(150)
    expect(pointInPoly(layout.rooms.breakRoom.vendingMachinePosition, layout.rooms.trainingRoom.zonePoints)).toBe(false)
  })

  it('all break-room seat positions fall inside the break-room polygon', () => {
    const layout = computeBuildingLayout(150)
    for (const seat of layout.rooms.breakRoom.seatPositions) {
      expect(pointInPoly(seat, layout.rooms.breakRoom.zonePoints)).toBe(true)
    }
  })

  it('water-cooler cluster positions fall inside the break-room polygon', () => {
    const layout = computeBuildingLayout(150)
    expect(layout.rooms.breakRoom.waterCoolerCluster.length).toBeGreaterThan(0)
    for (const p of layout.rooms.breakRoom.waterCoolerCluster) {
      expect(pointInPoly(p, layout.rooms.breakRoom.zonePoints)).toBe(true)
    }
  })

  it('chatting hotspots fall inside the agent floor polygon', () => {
    const layout = computeBuildingLayout(150)
    for (const [a, b] of layout.rooms.agentFloor.chattingHotspots) {
      expect(pointInPoly(a, layout.rooms.agentFloor.zonePoints)).toBe(true)
      expect(pointInPoly(b, layout.rooms.agentFloor.zonePoints)).toBe(true)
    }
  })

  it('janitor path is a non-empty loop within the agent floor polygon', () => {
    const layout = computeBuildingLayout(150)
    expect(layout.rooms.agentFloor.janitorPath.length).toBeGreaterThanOrEqual(4)
    for (const p of layout.rooms.agentFloor.janitorPath) {
      expect(pointInPoly(p, layout.rooms.agentFloor.zonePoints)).toBe(true)
    }
  })

  it('multiple janitor paths exist (Round 3 — variety)', () => {
    const layout = computeBuildingLayout(150)
    expect(layout.rooms.agentFloor.janitorPaths.length).toBeGreaterThanOrEqual(2)
    for (const path of layout.rooms.agentFloor.janitorPaths) {
      expect(path.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('janitor room visits target gym/training/breakRoom', () => {
    const layout = computeBuildingLayout(150)
    const visits = layout.rooms.agentFloor.janitorRoomVisits
    expect(visits.length).toBeGreaterThanOrEqual(1)
    const allowed = new Set(['gym', 'training', 'breakRoom'])
    for (const v of visits) {
      expect(allowed.has(v.roomId)).toBe(true)
    }
  })

  it('smoking patio has zone, railing, bench, ashtray, and standing positions', () => {
    const layout = computeBuildingLayout(150)
    const p = layout.rooms.smokingPatio
    expect(p.zonePoints.length).toBe(4)
    expect(p.railingSegments.length).toBeGreaterThanOrEqual(3)
    expect(p.bench).toBeDefined()
    expect(p.ashtray).toBeDefined()
    expect(p.standingPositions.length).toBeGreaterThanOrEqual(4)
  })

  it('all rooms fit within the building footprint', () => {
    const layout = computeBuildingLayout(150)
    const inBuilding = (b: IsoBounds) =>
      b.iMin >= 0 && b.iMax <= layout.tilesW && b.jMin >= 0 && b.jMax <= layout.tilesD
    expect(inBuilding(layout.rooms.reception.isoBounds)).toBe(true)
    expect(inBuilding(layout.rooms.agentFloor.isoBounds)).toBe(true)
    expect(inBuilding(layout.rooms.breakRoom.isoBounds)).toBe(true)
    expect(inBuilding(layout.rooms.trainingRoom.isoBounds)).toBe(true)
    expect(inBuilding(layout.rooms.restrooms.isoBounds)).toBe(true)
    expect(inBuilding(layout.rooms.gym.isoBounds)).toBe(true)
    for (const o of layout.rooms.managerOffices) {
      expect(inBuilding(o.isoBounds)).toBe(true)
    }
  })
})
