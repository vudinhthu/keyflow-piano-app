import { afterEach, describe, expect, it, vi } from 'vitest'
import { KeyboardListener } from '../src/features/keyboard/KeyboardListener'

function setup() {
  const piano = { ready: vi.fn(() => true), press: vi.fn(), release: vi.fn(), panic: vi.fn() }
  const keyboard = new KeyboardListener(piano)
  const event = (code = 'KeyZ', repeat = false) => ({ code, repeat, metaKey: false, ctrlKey: false, altKey: false, target: null, preventDefault: vi.fn() })
  return { piano, keyboard, event }
}

afterEach(() => vi.unstubAllGlobals())
describe('keyboard lifecycle', () => {
  it('samples velocity on note-on without retriggering a held key when the setting changes', () => {
    const { piano, event } = setup()
    let velocity = 0.4
    const keyboard = new KeyboardListener(piano, () => 0, undefined, () => velocity)
    keyboard.keydown(event())
    velocity = 1
    keyboard.keydown(event())
    keyboard.keyup({ code: 'KeyZ' })
    keyboard.keydown(event())
    expect(piano.press.mock.calls).toEqual([['keyboard:KeyZ', 48, 0.4], ['keyboard:KeyZ', 48, 1]])
  })
  it('holds Space as a momentary pedal, ignores repeat and releases even after focus changes', () => {
    const { piano, event } = setup()
    const setSustain = vi.fn()
    const keyboard = new KeyboardListener({ ...piano, setSustain })
    const e = event('Space')
    keyboard.keydown(e)
    keyboard.keydown(event('Space', true))
    keyboard.keyup({ code: 'Space' })
    expect(setSustain.mock.calls).toEqual([['keyboard:Space', true], ['keyboard:Space', false]])
    expect(e.preventDefault).toHaveBeenCalledOnce()
    expect(piano.press).not.toHaveBeenCalled()
  })
  it('uses current octave for new presses while release keeps the original owner', () => {
    const { piano, event } = setup()
    let octave = 0
    const keyboard = new KeyboardListener(piano, () => octave)
    keyboard.keydown(event())
    octave = 1
    keyboard.keydown(event())
    keyboard.keyup({ code: 'KeyZ' })
    keyboard.keydown(event())
    expect(piano.press.mock.calls).toEqual([['keyboard:KeyZ', 48, 0.72], ['keyboard:KeyZ', 60, 0.72]])
    expect(piano.release).toHaveBeenCalledExactlyOnceWith('keyboard:KeyZ')
  })
  it('changes octave once per arrow press and preserves modifier shortcuts', () => {
    const { piano, event } = setup()
    const shift = vi.fn()
    const keyboard = new KeyboardListener(piano, () => 0, shift)
    keyboard.keydown(event('ArrowUp'))
    keyboard.keydown(event('ArrowUp', true))
    keyboard.keydown(event('ArrowUp'))
    keyboard.keyup({ code: 'ArrowUp' })
    keyboard.keydown({ ...event('ArrowDown'), ctrlKey: true })
    keyboard.keydown(event('ArrowDown'))
    expect(shift.mock.calls).toEqual([[1], [-1]])
    expect(piano.press).not.toHaveBeenCalled()
  })
  it('ignores playing before samples are ready without stealing browser input', () => {
    const { piano, keyboard, event } = setup()
    piano.ready.mockReturnValue(false)
    const e = event()
    keyboard.keydown(e)
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(piano.press).not.toHaveBeenCalled()
  })
  it('ignores both browser repeats and duplicated physical keydown', () => {
    const { piano, keyboard, event } = setup()
    keyboard.keydown(event())
    keyboard.keydown(event('KeyZ', true))
    keyboard.keydown(event())
    expect(piano.press).toHaveBeenCalledExactlyOnceWith('keyboard:KeyZ', 48, 0.72)
  })
  it('accepts a new press after keyup and ignores stray keyups', () => {
    const { piano, keyboard, event } = setup()
    keyboard.keyup({ code: 'KeyZ' })
    expect(piano.release).not.toHaveBeenCalled()
    keyboard.keydown(event())
    keyboard.keyup({ code: 'KeyZ' })
    keyboard.keydown(event())
    expect(piano.press).toHaveBeenCalledTimes(2)
    expect(piano.release).toHaveBeenCalledExactlyOnceWith('keyboard:KeyZ')
  })
  it('leaves OS/browser shortcuts and unmapped keys alone', () => {
    const { piano, keyboard, event } = setup()
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) keyboard.keydown({ ...event(), [modifier]: true })
    keyboard.keydown(event('Space'))
    keyboard.keydown(event('ArrowUp'))
    expect(piano.press).not.toHaveBeenCalled()
  })
  it('ignores input fields and editable content', () => {
    class Editable { closest() { return this } }
    vi.stubGlobal('Element', Editable)
    const { piano, keyboard, event } = setup()
    keyboard.keydown({ ...event(), target: new Editable() as unknown as EventTarget })
    expect(piano.press).not.toHaveBeenCalled()
  })
  it('releases an already held key even when modifier/focus changes', () => {
    const { piano, keyboard, event } = setup()
    keyboard.keydown(event())
    keyboard.keyup({ code: 'KeyZ' })
    expect(piano.release).toHaveBeenCalledWith('keyboard:KeyZ')
  })
  it('reset clears input owners so keys work after focus returns', () => {
    const { piano, keyboard, event } = setup()
    keyboard.keydown(event())
    keyboard.reset()
    keyboard.keydown(event())
    expect(piano.panic).toHaveBeenCalledOnce()
    expect(piano.press).toHaveBeenCalledTimes(2)
  })
  it('blur, pagehide and visibility clear notes; teardown removes listeners', () => {
    const { piano, keyboard } = setup()
    const target = new EventTarget()
    const doc = Object.assign(new EventTarget(), { hidden: true })
    const cleanup = keyboard.attach(target as Window, doc as unknown as Document)
    target.dispatchEvent(new Event('blur'))
    target.dispatchEvent(new Event('pagehide'))
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(piano.panic).toHaveBeenCalledTimes(3)
    cleanup()
    target.dispatchEvent(new Event('blur'))
    expect(piano.panic).toHaveBeenCalledTimes(4)
  })
})
