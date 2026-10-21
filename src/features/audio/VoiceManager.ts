import { FIRST_NOTE, LAST_NOTE } from '../piano/notes'

export interface NoteOutput {
  attack(note: number, velocity: number): void
  release(note: number): void
  releaseAll(): void
}

/** One sounding held note per pitch; independent input owners share it. */
export class VoiceManager {
  private readonly owners = new Map<string, number>()
  private readonly held = new Map<number, Set<string>>()
  private readonly sustained = new Set<number>()
  private sustain = false

  constructor(private readonly output: NoteOutput, private readonly changed: (notes: number[]) => void, readonly limit = 32, private readonly sustainedChanged?: (notes: number[]) => void) {}

  press(source: string, note: number, velocity: number): void {
    if (this.owners.has(source) || !Number.isInteger(note) || note < FIRST_NOTE || note > LAST_NOTE || !Number.isFinite(velocity)) return
    let group = this.held.get(note)
    if (!group) {
      if (this.sustained.delete(note)) this.output.release(note)
      if (this.held.size + this.sustained.size >= this.limit) {
        const released = this.sustained.values().next().value
        if (released !== undefined) {
          this.sustained.delete(released)
          this.output.release(released)
        } else {
          const oldest = this.held.keys().next().value
          if (oldest !== undefined) {
            for (const owner of this.held.get(oldest)!) this.owners.delete(owner)
            this.held.delete(oldest)
            this.output.release(oldest)
          }
        }
      }
      this.output.attack(note, Math.max(0.01, Math.min(1, velocity)))
      group = new Set()
      this.held.set(note, group)
    }
    group.add(source)
    this.owners.set(source, note)
    this.publish()
  }

  release(source: string): void {
    const note = this.owners.get(source)
    if (note === undefined) return
    this.owners.delete(source)
    const group = this.held.get(note)!
    group.delete(source)
    if (group.size === 0) {
      this.held.delete(note)
      if (this.sustain) this.sustained.add(note)
      else this.output.release(note)
    }
    this.publish()
  }

  setSustain(enabled: boolean): void {
    if (this.sustain === enabled) return
    this.sustain = enabled
    if (!enabled) {
      for (const note of this.sustained) this.output.release(note)
      this.sustained.clear()
    }
    this.publish()
  }

  panic(): void {
    this.output.releaseAll()
    this.owners.clear()
    this.held.clear()
    this.sustained.clear()
    this.sustain = false
    this.publish()
  }

  private publish(): void {
    this.changed([...this.held.keys()].sort((a, b) => a - b))
    this.sustainedChanged?.([...this.sustained].sort((a, b) => a - b))
  }
}
