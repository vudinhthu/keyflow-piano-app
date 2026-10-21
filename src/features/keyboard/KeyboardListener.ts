import { DEFAULT_VELOCITY } from '../piano/notes'
import { noteForCode } from './mapping'

export interface PianoInput {
  ready(): boolean
  press(source: string, note: number, velocity: number): void
  release(source: string): void
  panic(): void
  setSustain?(source: string, pressed: boolean): void
}

function isEditable(target: EventTarget | null): boolean {
  return typeof Element !== 'undefined' && target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))
}

/** Input/audio execute synchronously; React only observes the result. */
export class KeyboardListener {
  private readonly down = new Set<string>()
  private detach?: () => void

  constructor(private readonly piano: PianoInput, private readonly octave: () => number = () => 0, private readonly shiftOctave?: (direction: -1 | 1) => void, private readonly velocity: () => number = () => DEFAULT_VELOCITY) {}

  keydown(event: Pick<KeyboardEvent, 'code' | 'repeat' | 'metaKey' | 'ctrlKey' | 'altKey' | 'target' | 'preventDefault'>): void {
    if (event.metaKey || event.ctrlKey || event.altKey || isEditable(event.target)) return
    if (event.code === 'Space' && this.piano.setSustain) {
      if (typeof Element !== 'undefined' && event.target instanceof Element && event.target.closest('button, a, [role="button"]')) return
      if (!this.piano.ready()) return
      event.preventDefault()
      if (event.repeat || this.down.has(event.code)) return
      this.down.add(event.code)
      this.piano.setSustain('keyboard:Space', true)
      return
    }
    if (this.shiftOctave && (event.code === 'ArrowUp' || event.code === 'ArrowDown')) {
      event.preventDefault()
      if (event.repeat || this.down.has(event.code)) return
      this.down.add(event.code)
      this.shiftOctave(event.code === 'ArrowUp' ? 1 : -1)
      return
    }
    const note = noteForCode(event.code, this.octave())
    if (note === undefined || !this.piano.ready()) return
    event.preventDefault()
    if (event.repeat || this.down.has(event.code)) return
    this.down.add(event.code)
    this.piano.press(`keyboard:${event.code}`, note, this.velocity())
  }

  keyup(event: Pick<KeyboardEvent, 'code'>): void {
    if (!this.down.delete(event.code)) return
    if (event.code === 'Space' && this.piano.setSustain) {
      this.piano.setSustain('keyboard:Space', false)
      return
    }
    this.piano.release(`keyboard:${event.code}`)
  }

  reset(): void {
    this.down.clear()
    this.piano.panic()
  }

  attach(target: Window = window, doc: Document = document): () => void {
    this.detach?.()
    const down = (event: KeyboardEvent) => this.keydown(event)
    const up = (event: KeyboardEvent) => this.keyup(event)
    const reset = () => this.reset()
    const visibility = () => { if (doc.hidden) reset() }
    target.addEventListener('keydown', down)
    target.addEventListener('keyup', up)
    target.addEventListener('blur', reset)
    target.addEventListener('pagehide', reset)
    doc.addEventListener('visibilitychange', visibility)
    this.detach = () => {
      target.removeEventListener('keydown', down)
      target.removeEventListener('keyup', up)
      target.removeEventListener('blur', reset)
      target.removeEventListener('pagehide', reset)
      doc.removeEventListener('visibilitychange', visibility)
      reset()
    }
    return this.detach
  }
}
