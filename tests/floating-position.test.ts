import { describe, expect, it } from 'vitest'
import { clampPosition, parseFloatingPosition, projectPosition, relativePosition } from '../src/features/settings/floatingPosition'

describe('floating controls position', () => {
  const panel = { width: 56, height: 204 }
  const portrait = { width: 390, height: 844 }
  it('defaults to the left-center and rejects malformed, future, out-of-range records', () => {
    const fallback = { x: 0, y: 0.5 }
    for (const raw of [null, '{', '{"version":2,"x":0.5,"y":0.5}', '{"version":1,"x":-1,"y":0.5}', '{"version":1,"x":0.5,"y":2}', '{"version":1,"x":"1","y":0.5}']) expect(parseFloatingPosition(raw)).toEqual(fallback)
    expect(projectPosition(fallback, portrait, panel)).toEqual({ x: 8, y: 320 })
  })
  it('clamps dragged controls to safe viewport edges and handles short viewports', () => {
    expect(clampPosition({ x: -500, y: -500 }, portrait, panel)).toEqual({ x: 8, y: 8 })
    expect(clampPosition({ x: 5000, y: 5000 }, portrait, panel)).toEqual({ x: 326, y: 632 })
    expect(clampPosition({ x: 100, y: 100 }, { width: 70, height: 100 }, panel)).toEqual({ x: 8, y: 8 })
  })
  it('keeps the same relative placement across orientation changes without going offscreen', () => {
    const saved = relativePosition({ x: 326, y: 632 }, portrait, panel)
    expect(saved).toEqual({ x: 1, y: 1 })
    expect(parseFloatingPosition(JSON.stringify({ version: 1, ...saved }))).toEqual(saved)
    expect(projectPosition(saved, { width: 844, height: 390 }, panel)).toEqual({ x: 780, y: 178 })
  })
})
