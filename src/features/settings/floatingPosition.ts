export const FLOATING_POSITION_KEY = 'keyflow-piano:floating-controls'
export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export const FLOATING_MARGIN = 8

export function positionBounds(viewport: Size, panel: Size): Point {
  return { x: Math.max(0, viewport.width - panel.width - FLOATING_MARGIN * 2), y: Math.max(0, viewport.height - panel.height - FLOATING_MARGIN * 2) }
}
export function clampPosition(point: Point, viewport: Size, panel: Size): Point {
  const bounds = positionBounds(viewport, panel)
  return { x: Math.max(FLOATING_MARGIN, Math.min(point.x, FLOATING_MARGIN + bounds.x)), y: Math.max(FLOATING_MARGIN, Math.min(point.y, FLOATING_MARGIN + bounds.y)) }
}
export function projectPosition(ratio: Point, viewport: Size, panel: Size): Point {
  const bounds = positionBounds(viewport, panel)
  return { x: FLOATING_MARGIN + bounds.x * ratio.x, y: FLOATING_MARGIN + bounds.y * ratio.y }
}
export function relativePosition(point: Point, viewport: Size, panel: Size): Point {
  const bounds = positionBounds(viewport, panel)
  const clamped = clampPosition(point, viewport, panel)
  return { x: bounds.x ? (clamped.x - FLOATING_MARGIN) / bounds.x : 0, y: bounds.y ? (clamped.y - FLOATING_MARGIN) / bounds.y : 0 }
}
export function parseFloatingPosition(raw: string | null): Point {
  const fallback = { x: 0, y: 0.5 }
  try {
    const value: unknown = raw ? JSON.parse(raw) : null
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('x' in value) || !('y' in value)) return fallback
    if (typeof value.x !== 'number' || typeof value.y !== 'number' || !Number.isFinite(value.x) || !Number.isFinite(value.y) || value.x < 0 || value.x > 1 || value.y < 0 || value.y > 1) return fallback
    return { x: value.x, y: value.y }
  } catch { return fallback }
}
