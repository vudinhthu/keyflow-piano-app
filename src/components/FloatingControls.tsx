import { useEffect, useRef, useState, type RefObject } from 'react'
import { clampPosition, FLOATING_POSITION_KEY, parseFloatingPosition, projectPosition, relativePosition, type Point } from '../features/settings/floatingPosition'
import { ControlIcon } from './ControlIcon'
import { OctaveControl } from './OctaveControl'
import { SustainControl } from './SustainControl'

export function FloatingControls({ playingArea }: { playingArea: RefObject<HTMLDivElement | null> }) {
  const panel = useRef<HTMLElement>(null)
  const point = useRef<Point>({ x: 8, y: 8 })
  const ratio = useRef<Point>({ x: 0, y: 0.5 })
  const drag = useRef<{ id: number; offset: Point; origin: Point } | null>(null)
  const frame = useRef<number | undefined>(undefined)
  const [visible, setVisible] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  const dimensions = () => ({ viewport: { width: window.innerWidth, height: window.innerHeight }, size: { width: panel.current?.offsetWidth || 56, height: panel.current?.offsetHeight || 220 } })
  const paint = () => {
    if (!panel.current) return
    panel.current.style.left = `${point.current.x}px`
    panel.current.style.top = `${point.current.y}px`
  }
  const move = (next: Point) => {
    const { viewport, size } = dimensions()
    point.current = clampPosition(next, viewport, size)
    if (frame.current !== undefined) return
    frame.current = window.requestAnimationFrame(() => { frame.current = undefined; paint() })
  }
  const save = () => {
    const { viewport, size } = dimensions()
    ratio.current = relativePosition(point.current, viewport, size)
    try { window.localStorage.setItem(FLOATING_POSITION_KEY, JSON.stringify({ version: 1, ...ratio.current })) } catch { /* Moving controls must work when storage is denied/full. */ }
    setAnnouncement('Đã di chuyển điều khiển tiếng đàn.')
  }
  const finish = (persist: boolean) => {
    if (!drag.current) return
    if (!persist) point.current = drag.current.origin
    drag.current = null
    if (frame.current !== undefined) window.cancelAnimationFrame(frame.current)
    frame.current = undefined
    paint()
    if (persist) save()
  }

  useEffect(() => {
    try { ratio.current = parseFloatingPosition(window.localStorage.getItem(FLOATING_POSITION_KEY)) } catch { /* Defaults are usable without storage. */ }
    const layout = () => {
      const node = panel.current
      if (!node) return
      drag.current = null
      if (frame.current !== undefined) window.cancelAnimationFrame(frame.current)
      frame.current = undefined
      const viewport = { width: window.innerWidth, height: window.innerHeight }
      point.current = projectPosition(ratio.current, viewport, { width: node.offsetWidth, height: node.offsetHeight })
      node.style.left = `${point.current.x}px`; node.style.top = `${point.current.y}px`
    }
    const cancel = () => {
      if (!drag.current) return
      point.current = drag.current.origin; drag.current = null
      if (frame.current !== undefined) window.cancelAnimationFrame(frame.current)
      frame.current = undefined
      if (panel.current) { panel.current.style.left = `${point.current.x}px`; panel.current.style.top = `${point.current.y}px` }
    }
    layout()
    const observer = new IntersectionObserver(entries => setVisible(entries[0]?.isIntersecting ?? false))
    if (playingArea.current) observer.observe(playingArea.current)
    window.addEventListener('resize', layout)
    window.addEventListener('blur', cancel)
    return () => {
      observer.disconnect(); window.removeEventListener('resize', layout); window.removeEventListener('blur', cancel)
      if (frame.current !== undefined) window.cancelAnimationFrame(frame.current)
    }
  }, [playingArea])

  return <aside ref={panel} className={`floating-controls ${visible ? '' : 'is-hidden'}`} aria-label="Octave và Sustain nổi">
    <button type="button" className="floating-grip" aria-label="Di chuyển điều khiển" title="Kéo để di chuyển · hoặc dùng phím mũi tên"
      onPointerDown={event => {
        if (event.button !== 0 || drag.current) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { id: event.pointerId, offset: { x: event.clientX - point.current.x, y: event.clientY - point.current.y }, origin: { ...point.current } }
      }}
      onPointerMove={event => { if (drag.current?.id === event.pointerId) move({ x: event.clientX - drag.current.offset.x, y: event.clientY - drag.current.offset.y }) }}
      onPointerUp={event => { if (drag.current?.id === event.pointerId) finish(true) }}
      onPointerCancel={event => { if (drag.current?.id === event.pointerId) finish(false) }}
      onLostPointerCapture={event => { if (drag.current?.id === event.pointerId) finish(false) }}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) return
        event.preventDefault(); event.stopPropagation()
        move({ x: point.current.x + (event.code === 'ArrowLeft' ? -12 : event.code === 'ArrowRight' ? 12 : 0), y: point.current.y + (event.code === 'ArrowUp' ? -12 : event.code === 'ArrowDown' ? 12 : 0) })
        save()
      }}><ControlIcon name="grip" /></button>
    <OctaveControl />
    <SustainControl />
    <span className="visually-hidden" role="status" aria-live="polite">{announcement}</span>
  </aside>
}
