import { afterEach, describe, expect, it, vi } from 'vitest'
import { KeyboardListener } from '../src/features/keyboard/KeyboardListener'
import { setVelocity, shiftOctave } from '../src/features/keyboard/controls'
import { usePianoStore } from '../src/stores/pianoStore'
import { VoiceManager } from '../src/features/audio/VoiceManager'

afterEach(() => usePianoStore.setState({ octaveShift: 0, velocity: 0.72 }))
const event = (code: string) => ({ code, repeat: false, metaKey: false, ctrlKey: false, altKey: false, target: null, preventDefault: vi.fn() })

describe('control-to-input behavior', () => {
  it('clamps repeated octave changes and keeps releases on the pitch attacked before shifting', () => {
    const attack = vi.fn()
    const release = vi.fn()
    const voices = new VoiceManager({ attack, release, releaseAll: vi.fn() }, vi.fn())
    const keyboard = new KeyboardListener({ ready: () => true, press: (owner, note, velocity) => voices.press(owner, note, velocity), release: owner => voices.release(owner), panic: () => voices.panic() }, () => usePianoStore.getState().octaveShift, shiftOctave)
    for (let i = 0; i < 6; i++) { keyboard.keydown(event('ArrowDown')); keyboard.keyup({ code: 'ArrowDown' }) }
    expect(usePianoStore.getState().octaveShift).toBe(-1)
    keyboard.keydown(event('KeyZ'))
    for (let i = 0; i < 6; i++) { keyboard.keydown(event('ArrowUp')); keyboard.keyup({ code: 'ArrowUp' }) }
    expect(usePianoStore.getState().octaveShift).toBe(2)
    keyboard.keyup({ code: 'KeyZ' })
    keyboard.keydown(event('KeyZ'))
    keyboard.keydown(event('KeyU'))
    expect(attack.mock.calls).toEqual([[36, 0.72], [72, 0.72], [95, 0.72]])
    expect(release.mock.calls).toEqual([[36]])
    keyboard.reset()
  })
  it('applies chosen velocity to fresh notes, retains held attack and ignores unsupported selections', () => {
    const attack = vi.fn()
    const voices = new VoiceManager({ attack, release: vi.fn(), releaseAll: vi.fn() }, vi.fn())
    const keyboard = new KeyboardListener({ ready: () => true, press: (owner, note, velocity) => voices.press(owner, note, velocity), release: owner => voices.release(owner), panic: () => voices.panic() }, () => 0, undefined, () => usePianoStore.getState().velocity)
    setVelocity(0.4)
    keyboard.keydown(event('KeyZ'))
    setVelocity(1)
    keyboard.keydown(event('KeyZ'))
    keyboard.keyup({ code: 'KeyZ' })
    setVelocity(0.5)
    keyboard.keydown(event('KeyZ'))
    expect(attack.mock.calls).toEqual([[48, 0.4], [48, 1]])
    keyboard.reset()
  })
})
