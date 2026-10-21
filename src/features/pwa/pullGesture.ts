export const PULL_THRESHOLD = 96
export function pullDistance(start: { x: number; y: number }, current: { x: number; y: number }): number {
  const vertical = current.y - start.y
  const horizontal = Math.abs(current.x - start.x)
  return vertical > 0 && horizontal <= vertical / 2 ? Math.min(vertical, 160) : 0
}
