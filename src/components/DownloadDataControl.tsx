import { offlineManager } from '../features/offline/OfflineManager'
import { sampleDataManager } from '../features/audio/SampleDataManager'
import { useOfflineStore } from '../stores/offlineStore'
import { useSampleDataStore } from '../stores/sampleDataStore'

export function DownloadDataControl() {
  const phase = useOfflineStore(state => state.phase)
  const offlineBusy = useOfflineStore(state => state.busy)
  const applying = useOfflineStore(state => state.applying)
  const status = useSampleDataStore(state => state.status)
  const progress = useSampleDataStore(state => state.progress)
  const error = useSampleDataStore(state => state.error)
  const busy = offlineBusy || status === 'loading'
  const download = async () => {
    if (phase !== 'unavailable') await offlineManager.refresh(true)
    const saved = useOfflineStore.getState()
    // Storage failures retain a separate online/session download path.
    await sampleDataManager.prepare(saved.phase === 'ready' ? `keyflow-piano-v1-${saved.verifiedVersion}` : undefined)
    if ('storage' in navigator && navigator.storage.persist) {
      try { await navigator.storage.persist() } catch { /* Cache verification defines readiness. */ }
    }
  }
  const needsDownload = status === 'error' || phase === 'error' || (status !== 'ready' && phase !== 'ready')
  if (!needsDownload && status !== 'loading' && !error) return null
  return <div className="download-data-control">
    {needsDownload ? <button className="stop-button" disabled={busy || applying} onClick={() => { void download() }}>
      <span aria-hidden="true">↓</span> {busy ? status === 'loading' ? `Đang tải dữ liệu · ${progress}%` : 'Đang lưu dữ liệu…' : status === 'error' ? 'Thử lại tải dữ liệu' : 'Tải dữ liệu tiếng đàn'}
    </button> : null}
    {status === 'loading' ? <progress value={progress} max="100" aria-label="Tiến độ chuẩn bị dữ liệu" /> : null}
    {status !== 'ready' && <span role="status" aria-live="polite">{status === 'loading' ? `Đang chuẩn bị dữ liệu · ${progress}%` : 'Tải dữ liệu trước khi chơi'}</span>}
    {error ? <p className="audio-error" role="alert">{error}</p> : null}
  </div>
}
