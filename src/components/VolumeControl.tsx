import { audioEngine } from '../features/audio/AudioEngine'
import { usePianoStore } from '../stores/pianoStore'

export function VolumeControl() {
  const volume = usePianoStore((state) => state.volume)
  return <div className="volume-control">
    <label htmlFor="piano-volume">Âm lượng</label>
    <input
      id="piano-volume"
      type="range"
      min="0"
      max="100"
      step="1"
      value={volume}
      aria-valuetext={volume === 0 ? 'Tắt tiếng' : `${volume}%`}
      onChange={(event) => audioEngine.setVolume(Number(event.currentTarget.value))}
    />
    <output htmlFor="piano-volume">{volume}%</output>
  </div>
}
