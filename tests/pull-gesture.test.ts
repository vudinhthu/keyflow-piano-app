import { describe, expect, it } from 'vitest'
import { pullDistance, PULL_THRESHOLD } from '../src/features/pwa/pullGesture'

describe('pull-to-refresh direction and threshold', () => {
  const start = { x: 100, y: 100 }
  it('rejects horizontal keyboard scrolling and upward scroll', () => {
    expect(pullDistance(start, { x: 200, y: 120 })).toBe(0)
    expect(pullDistance(start, { x: 100, y: 30 })).toBe(0)
  })
  it('requires an intentional downward gesture and caps overshoot', () => {
    expect(pullDistance(start, { x: 110, y: 150 })).toBeLessThan(PULL_THRESHOLD)
    expect(pullDistance(start, { x: 110, y: 200 })).toBeGreaterThanOrEqual(PULL_THRESHOLD)
    expect(pullDistance(start, { x: 100, y: 1000 })).toBe(160)
  })
})
