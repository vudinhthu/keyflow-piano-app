import { audioEngine } from '../features/audio/AudioEngine'
import { usePianoStore } from '../stores/pianoStore'
import { useSampleDataStore } from '../stores/sampleDataStore'

export function AudioStart({ onStarted }: { onStarted: () => void }) {
  const inputBlocked = usePianoStore((state) => state.inputBlocked)
  const status = usePianoStore((state) => state.status)
  const progress = usePianoStore((state) => state.progress)
  const error = usePianoStore((state) => state.error)
  const ready = status === 'ready'
  const dataReady = useSampleDataStore(state => state.status === 'ready')
  const start = () => {
    // Resume synchronously in the user gesture; decoding reads prepared bytes only.
    void audioEngine.initialize().then(() => { if (audioEngine.ready()) onStarted() })
  }
  return <div className={`audio-controls ${ready ? 'is-ready' : ''}`}>
    <div className="audio-state" role="status" aria-live="polite">
      <span className={`status-dot ${ready ? 'lit' : ''}`} aria-hidden="true" />
      <span>{ready ? 'Sẵn sàng chơi' : status === 'loading' ? `Đang chuẩn bị âm thanh · ${progress}%` : status === 'error' ? 'Chưa bật được âm thanh' : dataReady ? 'Bật âm thanh để bắt đầu' : 'Hãy tải dữ liệu tiếng đàn trước'}</span>
    </div>
    {status === 'loading' ? <progress value={progress} max="100" aria-label="Tiến độ giải mã âm thanh" /> : null}
    {!ready ? <button className="start-button" disabled={!dataReady || inputBlocked || status === 'loading'} onClick={start}>
      <span aria-hidden="true">{status === 'loading' ? '◌' : '▶'}</span> {status === 'error' ? 'Thử lại' : status === 'loading' ? 'Đang chuẩn bị…' : 'Start Piano'}
    </button> : <button className="stop-button" onClick={audioEngine.panic}><span aria-hidden="true">■</span> Dừng các nốt</button>}
    {error ? <p className="audio-error" role="alert">{error}</p> : null}
  </div>
}
