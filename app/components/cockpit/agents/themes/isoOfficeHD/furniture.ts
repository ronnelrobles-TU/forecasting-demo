// Static furniture detail for the HD theme. Translated faithfully from the
// SVG room components, gym treadmill / weights, training whiteboard +
// chairs, break table / cooler / vending, restroom toilets / sinks /
// mirrors / urinals + tile divider, manager office desks / chairs /
// whiteboards / doors, reception security desk / guard / double doors.
//
// All draws return Pixi `Graphics` (or attach to one) and are intended to be
// added to the scenery container ONCE per layout. Call sites live in
// `scenery.ts`.

import { Container, Graphics } from 'pixi.js'
import {
  isoToScreen,
  type BuildingLayout,
} from '../isoOffice/geometry'

interface PointLike { x: number; y: number }

function polyPoints(pts: ReadonlyArray<PointLike>): number[] {
  const out: number[] = []
  for (const p of pts) { out.push(p.x, p.y) }
  return out
}

// ---------- gym ----------

function drawTreadmill(g: Graphics, x: number, y: number) {
  // Shadow
  g.ellipse(x + 0, y + 6, 11, 2.5).fill({ color: 0x1e293b, alpha: 0.35 })
  // Belt
  g.poly([x - 10, y + 4, x + 8, y - 2, x + 12, y + 2, x - 6, y + 8])
    .fill({ color: 0x1e293b }).stroke({ color: 0x0f172a, width: 0.5 })
  // Side rails
  g.poly([x - 10, y + 4, x - 10, y + 5.5, x - 6, y + 9.5, x - 6, y + 8])
    .fill({ color: 0x0f172a })
  g.poly([x + 12, y + 2, x + 12, y + 3.5, x - 6, y + 9.5, x - 6, y + 8])
    .fill({ color: 0x0f172a })
  // Roller ends
  g.ellipse(x - 8, y + 5.5, 2, 0.6).fill({ color: 0x475569 })
  g.ellipse(x + 10, y + 0, 2, 0.6).fill({ color: 0x475569 })
  // Frame uprights
  g.moveTo(x - 9, y + 4).lineTo(x - 12, y - 4).stroke({ color: 0x475569, width: 0.7 })
  g.moveTo(x - 3, y + 1.5).lineTo(x - 6, y - 6).stroke({ color: 0x475569, width: 0.7 })
  // Console
  g.rect(x - 12, y - 9, 9, 4).fill({ color: 0x0f172a }).stroke({ color: 0x475569, width: 0.4 })
  g.rect(x - 11, y - 8, 7, 2.4).fill({ color: 0x22c55e, alpha: 0.7 })
  g.moveTo(x - 12, y - 5).lineTo(x - 3, y - 5).stroke({ color: 0xcbd5e1, width: 0.6 })
}

function drawWeights(g: Graphics, x: number, y: number) {
  // Shadow
  g.ellipse(x, y + 5, 9, 2).fill({ color: 0x1e293b, alpha: 0.35 })
  // Bar
  g.rect(x - 7, y + 1, 14, 1).fill({ color: 0x475569 })
  // Plates
  g.ellipse(x - 7, y + 1.5, 1.4, 3).fill({ color: 0x0f172a }).stroke({ color: 0x1e293b, width: 0.3 })
  g.ellipse(x - 5.5, y + 1.5, 1.4, 3.5).fill({ color: 0x1e293b })
  g.ellipse(x + 7, y + 1.5, 1.4, 3).fill({ color: 0x0f172a }).stroke({ color: 0x1e293b, width: 0.3 })
  g.ellipse(x + 5.5, y + 1.5, 1.4, 3.5).fill({ color: 0x1e293b })
  // Dumbbell pair
  g.rect(x - 3, y + 7, 6, 0.8).fill({ color: 0x475569 })
  g.ellipse(x - 3, y + 7.4, 0.9, 1.6).fill({ color: 0x1e293b })
  g.ellipse(x + 3, y + 7.4, 0.9, 1.6).fill({ color: 0x1e293b })
}

export function drawGymFurniture(g: Graphics, layout: BuildingLayout) {
  const gym = layout.rooms.gym
  drawTreadmill(g, gym.treadmillPosition.x, gym.treadmillPosition.y)
  drawWeights(g, gym.weightsPosition.x, gym.weightsPosition.y)
}

// ---------- training room ----------

function drawWhiteboard(g: Graphics, x: number, y: number, big = true) {
  if (big) {
    g.rect(x - 18, y - 22, 36, 14).fill({ color: 0xf8fafc }).stroke({ color: 0x1e293b, width: 0.6 })
    g.moveTo(x - 15, y - 19).lineTo(x - 5, y - 19).stroke({ color: 0x3b82f6, width: 0.5 })
    g.moveTo(x - 15, y - 17).lineTo(x + 5, y - 17).stroke({ color: 0x3b82f6, width: 0.5 })
    g.moveTo(x - 15, y - 15).lineTo(x + 2, y - 15).stroke({ color: 0xdc2626, width: 0.5 })
    g.moveTo(x - 15, y - 13).lineTo(x + 8, y - 13).stroke({ color: 0x16a34a, width: 0.5 })
    g.rect(x - 18.5, y - 9, 37, 1.5).fill({ color: 0x94a3b8 })
    g.moveTo(x - 12, y - 7).lineTo(x - 14, y + 2).stroke({ color: 0x475569, width: 0.4 })
    g.moveTo(x + 12, y - 7).lineTo(x + 14, y + 2).stroke({ color: 0x475569, width: 0.4 })
  } else {
    // Smaller whiteboard for manager offices
    g.rect(x - 7, y - 12, 14, 9).fill({ color: 0xf8fafc }).stroke({ color: 0x1e293b, width: 0.5 })
    g.moveTo(x - 5, y - 9).lineTo(x - 1, y - 9).stroke({ color: 0x3b82f6, width: 0.5 })
    g.moveTo(x - 5, y - 7).lineTo(x + 2, y - 7).stroke({ color: 0x3b82f6, width: 0.5 })
    g.moveTo(x - 5, y - 5).lineTo(x + 1, y - 5).stroke({ color: 0xdc2626, width: 0.5 })
    g.rect(x - 7.5, y - 3, 15, 1.2).fill({ color: 0x94a3b8 })
  }
}

function drawStudentChair(g: Graphics, x: number, y: number) {
  g.poly([x - 3, y + 1, x + 3, y + 1, x + 2.5, y + 3, x - 2.5, y + 3])
    .fill({ color: 0x1e293b })
  g.rect(x - 2.8, y - 2.5, 5.6, 3.5).fill({ color: 0x475569 }).stroke({ color: 0x1e293b, width: 0.3 })
}

export function drawTrainingFurniture(g: Graphics, layout: BuildingLayout) {
  const t = layout.rooms.trainingRoom
  drawWhiteboard(g, t.whiteboardPosition.x, t.whiteboardPosition.y, true)
  for (const seat of t.studentSeats) {
    drawStudentChair(g, seat.x, seat.y)
  }
}

// ---------- break room ----------

function drawBreakTable(g: Graphics, x: number, y: number) {
  // Shadow
  g.ellipse(x + 0, y + 7, 18, 6).fill({ color: 0x1e293b, alpha: 0.35 })
  // Layered wood top
  g.ellipse(x + 0, y + 4, 17, 6.5).fill({ color: 0x451a03 })
  g.ellipse(x + 0, y + 2.5, 16, 6).fill({ color: 0xb45309 })
  g.ellipse(x + 0, y + 2, 15, 5.6).fill({ color: 0xd97706 })
  // Mugs
  g.rect(x - 8, y + 1.5, 3, 2.5).fill({ color: 0xffffff }).stroke({ color: 0x475569, width: 0.3 })
  g.rect(x + 3, y + 1, 3, 2.5).fill({ color: 0xffffff }).stroke({ color: 0x475569, width: 0.3 })
}

function drawWaterCooler(g: Graphics, x: number, y: number) {
  const yy = y - 22
  g.ellipse(x, yy + 9, 5, 1.5).fill({ color: 0x1e293b, alpha: 0.4 })
  g.rect(x - 4, yy - 2, 8, 11).fill({ color: 0xcbd5e1 }).stroke({ color: 0x1e293b, width: 0.4 })
  g.ellipse(x, yy - 2, 4, 1.3).fill({ color: 0x3b82f6 })
  g.poly([
    x - 3.5, yy - 2,
    x - 3.5, yy - 9,
    x - 2.5, yy - 10.5,
    x + 2.5, yy - 10.5,
    x + 3.5, yy - 9,
    x + 3.5, yy - 2,
  ]).fill({ color: 0xbfdbfe }).stroke({ color: 0x1e293b, width: 0.4 })
  g.rect(x - 1.2, yy + 3, 2.4, 2).fill({ color: 0x1e40af })
}

function drawVendingMachine(g: Graphics, x: number, y: number) {
  const yy = y - 26
  g.ellipse(x, yy + 13, 7, 2).fill({ color: 0x1e293b, alpha: 0.4 })
  g.rect(x - 6, yy - 3, 12, 16).fill({ color: 0xdc2626 }).stroke({ color: 0x7f1d1d, width: 0.5 })
  g.rect(x - 5, yy - 2, 10, 11).fill({ color: 0x1e293b, alpha: 0.55 }).stroke({ color: 0x7f1d1d, width: 0.3 })
  g.moveTo(x - 5, yy + 1).lineTo(x + 5, yy + 1).stroke({ color: 0xfbbf24, width: 0.3, alpha: 0.7 })
  g.moveTo(x - 5, yy + 4).lineTo(x + 5, yy + 4).stroke({ color: 0xfbbf24, width: 0.3, alpha: 0.7 })
  g.moveTo(x - 5, yy + 7).lineTo(x + 5, yy + 7).stroke({ color: 0xfbbf24, width: 0.3, alpha: 0.7 })
  g.rect(x - 4.5, yy + 10, 1, 2).fill({ color: 0x0f172a })
  g.rect(x - 3, yy + 10, 1, 2).fill({ color: 0x0f172a })
  g.rect(x - 1.5, yy + 10, 1, 2).fill({ color: 0x0f172a })
  g.rect(x + 0, yy + 10, 1, 2).fill({ color: 0x0f172a })
  g.rect(x + 3, yy + 10, 2.5, 1).fill({ color: 0xfbbf24 })
}

export function drawBreakRoomFurniture(g: Graphics, layout: BuildingLayout) {
  const r = layout.rooms.breakRoom
  drawWaterCooler(g, r.waterCoolerPosition.x, r.waterCoolerPosition.y)
  drawVendingMachine(g, r.vendingMachinePosition.x, r.vendingMachinePosition.y)
  drawBreakTable(g, r.tableCenter.x, r.tableCenter.y)
}

// ---------- restrooms ----------

function drawToilet(g: Graphics, x: number, y: number) {
  g.ellipse(x, y + 2.4, 3.2, 1.0).fill({ color: 0x1e293b, alpha: 0.25 })
  g.rect(x - 2.5, y - 3.6, 5, 2.0).fill({ color: 0xf8fafc }).stroke({ color: 0x475569, width: 0.35 })
  g.rect(x - 2.5, y - 3.6, 5, 0.5).fill({ color: 0xcbd5e1 })
  g.ellipse(x, y + 0.2, 2.7, 1.8).fill({ color: 0xf8fafc }).stroke({ color: 0x475569, width: 0.35 })
  g.ellipse(x, y + 0.2, 1.7, 1.0).fill({ color: 0xbae6fd, alpha: 0.7 })
  g.circle(x - 0.9, y - 1.2, 0.25).fill({ color: 0x94a3b8 })
  g.circle(x + 0.9, y - 1.2, 0.25).fill({ color: 0x94a3b8 })
  g.rect(x + 1.5, y - 3.0, 0.8, 0.4).fill({ color: 0xcbd5e1 }).stroke({ color: 0x64748b, width: 0.2 })
}

function drawSink(g: Graphics, x: number, y: number) {
  g.rect(x - 3.5, y - 1.8, 7, 3.6).fill({ color: 0xe2e8f0 }).stroke({ color: 0x475569, width: 0.3 })
  g.ellipse(x, y + 0.3, 2.4, 1.3).fill({ color: 0xcbd5e1 }).stroke({ color: 0x64748b, width: 0.35 })
  g.ellipse(x, y + 0.3, 1.9, 1.0).fill({ color: 0xbfdbfe, alpha: 0.65 })
  g.circle(x, y + 0.3, 0.35).fill({ color: 0x0f172a })
  g.rect(x - 0.45, y - 1.7, 0.9, 1.5).fill({ color: 0x94a3b8 }).stroke({ color: 0x475569, width: 0.2 })
  g.circle(x, y - 0.4, 0.35).fill({ color: 0xcbd5e1 })
  g.circle(x - 1.6, y - 1.3, 0.5).fill({ color: 0x94a3b8 }).stroke({ color: 0x475569, width: 0.2 })
  g.circle(x + 1.6, y - 1.3, 0.5).fill({ color: 0x94a3b8 }).stroke({ color: 0x475569, width: 0.2 })
}

function drawMirror(g: Graphics, x: number, y: number, width = 12) {
  g.rect(x - width / 2, y - 4.8, width, 3.6).fill({ color: 0x1f2937 }).stroke({ color: 0x0f172a, width: 0.5 })
  g.rect(x - width / 2 + 0.4, y - 4.5, width - 0.8, 3.0).fill({ color: 0xbae6fd })
  g.moveTo(x - width / 2 + 1.5, y - 4.4).lineTo(x - width / 2 + 4, y - 1.7)
    .stroke({ color: 0xffffff, width: 0.25, alpha: 0.7 })
}

function drawUrinal(g: Graphics, x: number, y: number) {
  g.rect(x - 2.5, y - 1.5, 5, 1.0).fill({ color: 0xcbd5e1 }).stroke({ color: 0x475569, width: 0.3 })
  g.poly([x - 2.4, y - 0.5, x + 2.4, y - 0.5, x + 2.0, y + 2.4, x - 2.0, y + 2.4])
    .fill({ color: 0xf8fafc }).stroke({ color: 0x475569, width: 0.3 })
  g.ellipse(x, y + 1.6, 0.7, 0.3).fill({ color: 0x0f172a })
  g.circle(x, y - 1.0, 0.4).fill({ color: 0x94a3b8 }).stroke({ color: 0x475569, width: 0.2 })
}

function drawStallEnclosure(g: Graphics, x: number, y: number) {
  // Stall floor tile
  g.poly([x - 4.5, y - 3, x + 4.5, y - 3, x + 4.5, y + 3.5, x - 4.5, y + 3.5])
    .fill({ color: 0xe0f2fe, alpha: 0.6 }).stroke({ color: 0x0891b2, width: 0.25 })
  // Side partitions
  g.rect(x - 4.7, y - 3.2, 0.5, 7).fill({ color: 0x94a3b8 }).stroke({ color: 0x475569, width: 0.25 })
  g.rect(x + 4.2, y - 3.2, 0.5, 7).fill({ color: 0x94a3b8 }).stroke({ color: 0x475569, width: 0.25 })
  // Back wall
  g.rect(x - 4.5, y - 3.5, 9, 0.5).fill({ color: 0x94a3b8 }).stroke({ color: 0x475569, width: 0.25 })
  // Front wall stubs (door always shown half-open in HD scenery, occupancy
  // is dynamic and lives in the overlay layer if we ever want to add it)
  g.rect(x - 4.5, y + 3.3, 2.0, 0.5).fill({ color: 0x94a3b8 }).stroke({ color: 0x475569, width: 0.25 })
  g.rect(x + 2.5, y + 3.3, 2.0, 0.5).fill({ color: 0x94a3b8 }).stroke({ color: 0x475569, width: 0.25 })
  // Half-open door
  g.rect(x - 2.5, y + 3.0, 2.2, 0.4).fill({ color: 0xcbd5e1 }).stroke({ color: 0x475569, width: 0.2 })
  drawToilet(g, x, y)
}

function drawRestroomDoor(g: Graphics, x: number, y: number) {
  g.rect(x - 3.5, y - 12, 7, 12).fill({ color: 0x475569 }).stroke({ color: 0x1e293b, width: 0.4 })
  g.rect(x - 2.7, y - 10.5, 5.4, 4).fill({ color: 0x334155 }).stroke({ color: 0x1e293b, width: 0.2 })
  g.rect(x - 2.7, y - 5.8, 5.4, 4).fill({ color: 0x334155 }).stroke({ color: 0x1e293b, width: 0.2 })
  g.rect(x - 3, y - 15, 6, 2.5).fill({ color: 0xf8fafc }).stroke({ color: 0x1e293b, width: 0.3 })
  g.circle(x + 2.3, y - 5.5, 0.7).fill({ color: 0xfbbf24 })
}

export function drawRestroomFurniture(g: Graphics, layout: BuildingLayout) {
  const r = layout.rooms.restrooms
  const ox = layout.origin.x
  const oy = layout.origin.y
  const b = r.isoBounds
  const midJ = (b.jMin + b.jMax) / 2

  // Pale-blue tile floor wash so the room reads as bathroom even in HD.
  g.poly(polyPoints(r.zonePoints)).fill({ color: 0xe0f2fe, alpha: 0.4 })

  // Tile divider line between M / F halves.
  const divA = isoToScreen(b.iMin, midJ, ox, oy)
  const divB = isoToScreen(b.iMax, midJ, ox, oy)
  g.moveTo(divA.x, divA.y).lineTo(divB.x, divB.y)
    .stroke({ color: 0x0891b2, width: 0.7, alpha: 0.7 })

  const mStall1 = isoToScreen(b.iMin + 1.0, b.jMin + 0.7, ox, oy)
  const mStall2 = isoToScreen(b.iMin + 2.4, b.jMin + 0.7, ox, oy)
  const mUrinal1 = isoToScreen(b.iMin + 4.0, b.jMin + 0.4, ox, oy)
  const mSink1  = isoToScreen(b.iMin + 1.5, midJ - 0.3, ox, oy)
  const mSink2  = isoToScreen(b.iMin + 3.5, midJ - 0.3, ox, oy)
  const mMirror = isoToScreen(b.iMin + 2.5, midJ - 0.5, ox, oy)

  drawStallEnclosure(g, mStall1.x, mStall1.y)
  drawStallEnclosure(g, mStall2.x, mStall2.y)
  drawUrinal(g, mUrinal1.x, mUrinal1.y)
  drawMirror(g, mMirror.x, mMirror.y - 1, 11)
  drawSink(g, mSink1.x, mSink1.y)
  drawSink(g, mSink2.x, mSink2.y)

  const fStall1 = isoToScreen(b.iMin + 1.0, midJ + 0.7, ox, oy)
  const fStall2 = isoToScreen(b.iMin + 2.4, midJ + 0.7, ox, oy)
  const fStall3 = isoToScreen(b.iMin + 4.2, midJ + 0.7, ox, oy)
  const fSink1  = isoToScreen(b.iMin + 1.5, b.jMax - 0.4, ox, oy)
  const fSink2  = isoToScreen(b.iMin + 3.5, b.jMax - 0.4, ox, oy)
  const fMirror = isoToScreen(b.iMin + 2.5, b.jMax - 0.6, ox, oy)

  drawStallEnclosure(g, fStall1.x, fStall1.y)
  drawStallEnclosure(g, fStall2.x, fStall2.y)
  drawStallEnclosure(g, fStall3.x, fStall3.y)
  drawMirror(g, fMirror.x, fMirror.y - 1, 11)
  drawSink(g, fSink1.x, fSink1.y)
  drawSink(g, fSink2.x, fSink2.y)

  for (const door of r.doorPositions) {
    drawRestroomDoor(g, door.x, door.y)
  }
}

// ---------- manager offices ----------

function drawExecChair(g: Graphics, x: number, y: number) {
  const yy = y - 9
  g.poly([x - 6, yy + 3, x + 6, yy + 3, x + 5, yy + 7, x - 5, yy + 7])
    .fill({ color: 0x0f172a })
  g.rect(x - 5.5, yy - 4, 11, 7).fill({ color: 0x1e293b }).stroke({ color: 0x020617, width: 0.3 })
  g.rect(x - 5, yy - 6, 10, 2).fill({ color: 0x334155 })
}

function drawExecDesk(g: Graphics, x: number, y: number) {
  g.poly([x + 0, y - 4, x + 18, y + 6, x + 0, y + 14, x - 18, y + 6])
    .fill({ color: 0x1e293b }).stroke({ color: 0x0f172a, width: 0.6 })
  g.poly([x - 18, y + 6, x - 18, y + 9, x + 0, y + 17, x + 0, y + 14])
    .fill({ color: 0x0f172a })
  g.poly([x + 18, y + 6, x + 18, y + 9, x + 0, y + 17, x + 0, y + 14])
    .fill({ color: 0x020617 })
  g.rect(x - 3.5, y + 0, 7, 4.2).fill({ color: 0x0f172a }).stroke({ color: 0x334155, width: 0.3 })
  g.poly([x - 4, y + 4.2, x + 4, y + 4.2, x + 2, y + 5.8, x - 2, y + 5.8])
    .fill({ color: 0x334155 })
  g.rect(x + 6, y + 3.5, 3, 2).fill({ color: 0xfbbf24 })
}

function drawManagerDoor(g: Graphics, x: number, y: number) {
  g.rect(x - 3, y - 12, 6, 12).fill({ color: 0x7c2d12 }).stroke({ color: 0x1e293b, width: 0.4 })
  g.circle(x + 2, y - 6, 0.6).fill({ color: 0xfbbf24 })
}

export function drawManagerOfficesFurniture(g: Graphics, layout: BuildingLayout) {
  for (const office of layout.rooms.managerOffices) {
    drawWhiteboard(g, office.whiteboardPosition.x, office.whiteboardPosition.y, false)
    drawExecChair(g, office.deskPosition.x - 4, office.deskPosition.y)
    drawExecDesk(g, office.deskPosition.x, office.deskPosition.y)
    drawManagerDoor(g, office.doorPosition.x, office.doorPosition.y)
  }
}

// ---------- reception ----------

function drawSecurityDesk(g: Graphics, x: number, y: number) {
  g.poly([x + 0, y - 4, x + 28, y + 6, x + 0, y + 16, x - 28, y + 6])
    .fill({ color: 0x475569 }).stroke({ color: 0x1e293b, width: 0.5 })
  g.poly([x - 28, y + 6, x - 28, y + 9, x + 0, y + 19, x + 0, y + 16])
    .fill({ color: 0x334155 })
  g.poly([x + 28, y + 6, x + 28, y + 9, x + 0, y + 19, x + 0, y + 16])
    .fill({ color: 0x1e293b })
  // Monitor
  g.rect(x - 3, y - 1, 6, 4).fill({ color: 0x0f172a }).stroke({ color: 0x1e293b, width: 0.3 })
  g.poly([x - 3.5, y + 3, x + 3.5, y + 3, x + 1.5, y + 4.5, x - 1.5, y + 4.5])
    .fill({ color: 0x475569 })
  // Sign-in book
  g.rect(x - 15, y + 3, 4, 3).fill({ color: 0xf1f5f9 }).stroke({ color: 0x475569, width: 0.3 })
  // Phone
  g.rect(x + 10, y + 3, 3, 2).fill({ color: 0x0f172a })
}

function drawDoubleDoor(g: Graphics, x: number, y: number) {
  // Welcome mat
  g.ellipse(x, y + 5, 20, 4).fill({ color: 0x7f1d1d, alpha: 0.4 })
  // Outer frame
  g.rect(x - 22, y - 22, 44, 22).stroke({ color: 0x1e293b, width: 0.8 })
  // Left + right doors with light-blue glass
  g.rect(x - 22, y - 22, 22, 22).fill({ color: 0x7dd3fc, alpha: 0.55 }).stroke({ color: 0x1e293b, width: 0.5 })
  g.rect(x + 0, y - 22, 22, 22).fill({ color: 0x7dd3fc, alpha: 0.55 }).stroke({ color: 0x1e293b, width: 0.5 })
  // Top mullion
  g.moveTo(x - 22, y - 15).lineTo(x + 22, y - 15).stroke({ color: 0x1e293b, width: 0.5 })
  // Door handles
  g.rect(x - 3, y - 12, 1.2, 5).fill({ color: 0xfbbf24 })
  g.rect(x + 1.8, y - 12, 1.2, 5).fill({ color: 0xfbbf24 })
}

export function drawReceptionFurniture(g: Graphics, layout: BuildingLayout) {
  const r = layout.rooms.reception
  drawSecurityDesk(g, r.securityDeskPosition.x, r.securityDeskPosition.y)
  drawDoubleDoor(g, r.doorPosition.x, r.doorPosition.y)
}

// ---------- smoking patio ----------

function drawBench(g: Graphics, x: number, y: number) {
  g.rect(x - 14, y - 1.5, 28, 3).fill({ color: 0x92400e }).stroke({ color: 0x451a03, width: 0.4 })
  g.rect(x - 12, y + 1.5, 1.5, 3.5).fill({ color: 0x451a03 })
  g.rect(x + 10.5, y + 1.5, 1.5, 3.5).fill({ color: 0x451a03 })
}

function drawAshtray(g: Graphics, x: number, y: number) {
  g.rect(x - 1.2, y - 2, 2.4, 6).fill({ color: 0x475569 }).stroke({ color: 0x1e293b, width: 0.3 })
  g.ellipse(x, y - 2.5, 3, 1.2).fill({ color: 0x1e293b }).stroke({ color: 0x0f172a, width: 0.3 })
}

export function drawSmokingPatio(g: Graphics, layout: BuildingLayout) {
  const p = layout.rooms.smokingPatio
  // Deck floor (warm brown)
  g.poly(polyPoints(p.zonePoints))
    .fill({ color: 0xa16207, alpha: 0.85 })
    .stroke({ color: 0x451a03, width: 0.6 })
  // Wood planks
  for (let i = 0; i < 3; i++) {
    const t = (i + 1) * 0.25
    const a = p.zonePoints[0]
    const b = p.zonePoints[1]
    const c = p.zonePoints[2]
    const d = p.zonePoints[3]
    const left = { x: a.x + (d.x - a.x) * t, y: a.y + (d.y - a.y) * t }
    const right = { x: b.x + (c.x - b.x) * t, y: b.y + (c.y - b.y) * t }
    g.moveTo(left.x, left.y).lineTo(right.x, right.y)
      .stroke({ color: 0x78350f, width: 0.4, alpha: 0.45 })
  }
  // Railings
  for (const [s, e] of p.railingSegments) {
    g.moveTo(s.x, s.y).lineTo(e.x, e.y).stroke({ color: 0x1e293b, width: 0.7 })
    g.rect(s.x - 0.4, s.y - 4, 0.8, 4).fill({ color: 0x1e293b })
    g.rect(e.x - 0.4, e.y - 4, 0.8, 4).fill({ color: 0x1e293b })
    g.moveTo(s.x, s.y - 4).lineTo(e.x, e.y - 4).stroke({ color: 0x334155, width: 0.6 })
  }
  drawBench(g, p.bench.x, p.bench.y)
  drawAshtray(g, p.ashtray.x, p.ashtray.y)
}

// ---------- guard sprite (reception) ----------

/** Build a static guard agent sprite for the reception desk. The HD agent
 *  layer doesn't include the guard since they're not in the simulation
 *  roster, this mirrors the SVG `<AgentSprite>` placement. */
export function buildGuardSprite(layout: BuildingLayout): Container {
  const c = new Container()
  const g = new Graphics()
  const guard = layout.rooms.reception.guardPosition
  c.x = guard.x
  c.y = guard.y
  // Shadow
  g.ellipse(0, 6, 4.5, 1.4).fill({ color: 0x1e293b, alpha: 0.35 })
  // Indigo shirt (guard uniform)
  g.moveTo(-3.5, -3)
    .quadraticCurveTo(-3.5, 3, -1.5, 4)
    .lineTo(1.5, 4)
    .quadraticCurveTo(3.5, 3, 3.5, -3)
    .closePath()
    .fill({ color: 0x4f46e5 }).stroke({ color: 0x0f172a, width: 0.4 })
  // Head
  g.ellipse(0, -5, 2.5, 2.3).fill({ color: 0xfde4b8 }).stroke({ color: 0x92400e, width: 0.3 })
  // Hair
  g.moveTo(-2.5, -6).quadraticCurveTo(0, -8.5, 2.5, -6).stroke({ color: 0x0f172a, width: 0.5 })
  g.circle(2.6, -5.3, 0.8).fill({ color: 0x1e293b })
  c.addChild(g)
  return c
}

/** Build static manager sprites (one per office, purple shirts). */
export function buildManagerSprites(layout: BuildingLayout): Container {
  const c = new Container()
  for (const office of layout.rooms.managerOffices) {
    const g = new Graphics()
    g.x = office.managerPosition.x
    g.y = office.managerPosition.y
    g.ellipse(0, 6, 4.5, 1.4).fill({ color: 0x1e293b, alpha: 0.35 })
    g.moveTo(-3.5, -3)
      .quadraticCurveTo(-3.5, 3, -1.5, 4)
      .lineTo(1.5, 4)
      .quadraticCurveTo(3.5, 3, 3.5, -3)
      .closePath()
      .fill({ color: 0xa855f7 }).stroke({ color: 0x0f172a, width: 0.4 })
    g.ellipse(0, -5, 2.5, 2.3).fill({ color: 0xfde4b8 }).stroke({ color: 0x92400e, width: 0.3 })
    g.moveTo(-2.5, -6).quadraticCurveTo(0, -8.5, 2.5, -6).stroke({ color: 0x0f172a, width: 0.5 })
    g.circle(2.6, -5.3, 0.8).fill({ color: 0x1e293b })
    c.addChild(g)
  }
  return c
}

// ---------- absent marker ----------

/** Draw a small coffee-cup + sticky-note "OUT" tag at desk position. Used
 *  to mark desks of agents who didn't show up today. */
export function drawAbsentMarker(g: Graphics, x: number, y: number) {
  // Mug body
  g.rect(x - 1.4, y - 1.5, 2.8, 2.6).fill({ color: 0xf8fafc, alpha: 0.85 })
    .stroke({ color: 0x475569, width: 0.25 })
  // Steam wisp
  g.moveTo(x - 0.5, y - 2.2).quadraticCurveTo(x - 0.2, y - 3, x + 0.4, y - 2.6)
    .stroke({ color: 0xcbd5e1, width: 0.25, alpha: 0.7 })
  // Sticky-note "OUT" tag
  g.rect(x + 2.6, y - 0.3, 2.4, 1.8).fill({ color: 0xfde68a, alpha: 0.85 })
    .stroke({ color: 0xa16207, width: 0.2 })
}
