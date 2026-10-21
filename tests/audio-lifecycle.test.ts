import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ loadSamples: vi.fn(), start: vi.fn(), setContext: vi.fn(), contexts: [] as { dispose: ReturnType<typeof vi.fn> }[], implicitDispose: vi.fn(), attack: vi.fn(), releaseAll: vi.fn() }))
vi.mock('../src/features/audio/SampleLoader', () => ({ loadSamples: mocks.loadSamples }))
vi.mock('tone', () => ({
  Context: class {
    rawContext = { addEventListener: vi.fn() }
    state = 'running'
    dispose = vi.fn()
    constructor() { mocks.contexts.push(this) }
  },
  Gain: class { gain = { linearRampTo: vi.fn() }; toDestination() { return this }; dispose = vi.fn() },
  Sampler: class { connect() { return this }; triggerAttack = mocks.attack; triggerRelease = vi.fn(); releaseAll = mocks.releaseAll; dispose = vi.fn() },
  start: mocks.start,
  setContext: mocks.setContext,
  getContext: () => ({ dispose: mocks.implicitDispose }),
  immediate: () => 0,
}))
import { AudioEngine } from '../src/features/audio/AudioEngine'
import { usePianoStore } from '../src/stores/pianoStore'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.contexts.length = 0
  mocks.start.mockResolvedValue(undefined)
  mocks.loadSamples.mockResolvedValue({})
  vi.stubGlobal('window', { setTimeout, clearTimeout })
  usePianoStore.setState({ status: 'idle', progress: 0, activeNotes: [], sustainedNotes: [], sustain: false })
})
afterEach(() => vi.unstubAllGlobals())

describe('audio page lifecycle', () => {
  it('closes the replaced implicit context, clears held state and starts a fresh engine after page disposal', async () => {
    const engine = new AudioEngine()
    await engine.initialize()
    expect(mocks.setContext).toHaveBeenCalledWith(mocks.contexts[0], true)
    engine.setSustain('keyboard:Space', true)
    engine.press('keyboard:KeyZ', 48, 0.4)
    engine.release('keyboard:KeyZ')
    engine.dispose()
    expect(mocks.contexts[0].dispose).toHaveBeenCalledOnce()
    expect(usePianoStore.getState()).toMatchObject({ status: 'idle', sustain: false, activeNotes: [], sustainedNotes: [] })
    expect(engine.ready()).toBe(false)
    await engine.initialize()
    expect(mocks.contexts).toHaveLength(2)
    expect(engine.ready()).toBe(true)
    engine.press('keyboard:KeyZ', 48, 1)
    expect(mocks.attack).toHaveBeenLastCalledWith('C3', 0, 1)
    engine.dispose()
  })
  it('does not let a disposed load overwrite or clear the replacement session', async () => {
    let resolveOld!: (buffers: Record<string, AudioBuffer>) => void
    let resolveNew!: (buffers: Record<string, AudioBuffer>) => void
    mocks.loadSamples.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    const engine = new AudioEngine()
    const old = engine.initialize()
    await vi.waitFor(() => expect(resolveOld).toBeTypeOf('function'))
    const oldProgress = mocks.loadSamples.mock.calls[0][2]
    engine.dispose()
    mocks.loadSamples.mockImplementationOnce(() => new Promise(resolve => { resolveNew = resolve }))
    const replacement = engine.initialize()
    await vi.waitFor(() => expect(resolveNew).toBeTypeOf('function'))
    oldProgress(100)
    resolveOld({})
    await old
    expect(usePianoStore.getState()).toMatchObject({ status: 'loading', progress: 0, error: null })
    expect(engine.initialize()).toBe(replacement)
    resolveNew({})
    await replacement
    expect(engine.ready()).toBe(true)
    engine.dispose()
  })
  it('closes the implicit context if the user leaves before pressing Start', () => {
    const engine = new AudioEngine()
    engine.dispose()
    expect(mocks.implicitDispose).toHaveBeenCalledOnce()
    expect(mocks.contexts).toHaveLength(0)
  })
})
