import * as Tone from 'tone'
import { usePianoStore } from '../../stores/pianoStore'
import { noteName } from '../piano/notes'
import { loadSamples } from './SampleLoader'
import { VoiceManager } from './VoiceManager'

export class AudioEngine {
  private sampler?: Tone.Sampler
  private masterGain?: Tone.Gain
  private context?: Tone.Context
  private controller?: AbortController
  private pending?: Promise<void>
  private generation = 0
  private readonly sustainOwners = new Set<string>()
  readonly voices = new VoiceManager({
    attack: (note, velocity) => this.sampler?.triggerAttack(noteName(note), Tone.immediate(), velocity),
    release: (note) => this.sampler?.triggerRelease(noteName(note), Tone.immediate()),
    releaseAll: () => this.sampler?.releaseAll(Tone.immediate()),
  }, (activeNotes) => usePianoStore.setState({ activeNotes }), 32, (sustainedNotes) => usePianoStore.setState({ sustainedNotes }))

  ready = (): boolean => !usePianoStore.getState().inputBlocked && usePianoStore.getState().status === 'ready' && this.context?.state === 'running'
  press = (source: string, note: number, velocity: number): void => { if (this.ready()) this.voices.press(source, note, velocity) }
  release = (source: string): void => this.voices.release(source)
  panic = (): void => {
    this.sustainOwners.clear()
    this.voices.panic()
    usePianoStore.setState({ sustain: false })
  }

  setSustain = (source: string, pressed: boolean): void => {
    if (pressed) {
      if (!this.ready()) return
      this.sustainOwners.add(source)
    } else this.sustainOwners.delete(source)
    const sustain = this.sustainOwners.size > 0
    this.voices.setSustain(sustain)
    usePianoStore.setState({ sustain })
  }

  setVolume(value: number): void {
    if (!Number.isFinite(value)) return
    const volume = Math.max(0, Math.min(100, Math.round(value)))
    // Update the common output before React observes the control state.
    this.masterGain?.gain.linearRampTo(volume / 100, 0.02, Tone.immediate())
    usePianoStore.setState({ volume })
  }

  initialize(): Promise<void> {
    if (this.pending) return this.pending
    const generation = this.generation
    if (this.sampler && this.context) {
      // Resume still occurs directly from the user gesture.
      usePianoStore.setState({ status: 'loading', error: null })
      this.pending = Tone.start()
        .then(() => { if (generation === this.generation) usePianoStore.setState({ status: 'ready', error: null }) })
        .catch(() => { if (generation === this.generation) usePianoStore.setState({ status: 'error', error: 'Không bật lại được âm thanh. Vui lòng thử lại.' }) })
        .finally(() => { if (generation === this.generation) this.pending = undefined })
      return this.pending
    }
    if (!this.context) {
      this.context = new Tone.Context({ latencyHint: 'interactive', lookAhead: 0 })
      // This page has one engine; the implicit Tone context is no longer needed.
      Tone.setContext(this.context, true)
      this.context.rawContext.addEventListener('statechange', () => {
        if (this.sampler && this.context?.state !== 'running') {
          this.panic()
          usePianoStore.setState({ status: 'idle' })
        }
      })
    }
    const context = this.context
    const start = Tone.start()
    usePianoStore.setState({ status: 'loading', progress: 0, error: null })
    const controller = new AbortController()
    this.controller = controller
    const timeout = window.setTimeout(() => controller.abort(new Error('Tải âm thanh quá lâu. Vui lòng thử lại.')), 30000)
    this.pending = (async () => {
      try {
        await start
        controller.signal.throwIfAborted()
        const raw = context.rawContext as AudioContext
        const samples = await loadSamples(raw, controller.signal, (progress) => { if (generation === this.generation) usePianoStore.setState({ progress }) })
        controller.signal.throwIfAborted()
        this.masterGain = new Tone.Gain(usePianoStore.getState().volume / 100).toDestination()
        this.sampler = new Tone.Sampler({ urls: samples, attack: 0.005, release: 0.35, volume: -10 }).connect(this.masterGain)
        usePianoStore.setState({ status: 'ready', progress: 100, error: null })
      } catch (error) {
        if (generation !== this.generation) return
        controller.abort()
        this.sampler?.dispose()
        this.sampler = undefined
        this.masterGain?.dispose()
        this.masterGain = undefined
        usePianoStore.setState({ status: 'error', error: error instanceof Error ? error.message : 'Không khởi động được âm thanh. Vui lòng thử lại.' })
      } finally {
        window.clearTimeout(timeout)
        if (generation === this.generation) this.pending = undefined
      }
    })()
    return this.pending
  }

  dispose(): void {
    this.generation++
    this.controller?.abort()
    this.controller = undefined
    this.pending = undefined
    this.panic()
    this.sampler?.dispose()
    this.sampler = undefined
    this.masterGain?.dispose()
    this.masterGain = undefined
    const context = this.context ?? Tone.getContext()
    this.context = undefined
    context.dispose()
    usePianoStore.setState({ status: 'idle', progress: 0, activeNotes: [] })
  }
}

export const audioEngine = new AudioEngine()
