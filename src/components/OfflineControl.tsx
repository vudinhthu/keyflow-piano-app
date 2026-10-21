import { useEffect } from 'react'
import { offlineManager } from '../features/offline/OfflineManager'
import { useOfflineStore } from '../stores/offlineStore'
import { DownloadDataControl } from './DownloadDataControl'
import { useSampleDataStore } from '../stores/sampleDataStore'

export function OfflineControl() {
  useEffect(() => offlineManager.start(), [])
  const phase = useOfflineStore(state => state.phase)
  const status = useSampleDataStore(state => state.status)
  const message = useOfflineStore(state => state.message)
  const hasUpdate = useOfflineStore(state => state.hasUpdate)
  const allowed = useOfflineStore(state => state.updateAllowed)
  const applying = useOfflineStore(state => state.applying)
  const updateMessage = useOfflineStore(state => state.updateMessage)
  const needsDownload = status === 'error' || phase === 'error' || (status !== 'ready' && phase !== 'ready')
  const showError = phase === 'error' && Boolean(message)
  const visible = needsDownload || status === 'loading' || showError || hasUpdate || Boolean(updateMessage)
  return <aside className="offline-panel" aria-label="Dữ liệu và cập nhật" hidden={!visible} data-cache-phase={phase} data-sample-status={status}>
    {showError && <p className="offline-detail">{message}</p>}
    <DownloadDataControl />
    {hasUpdate && <div className="offline-update"><p>Có bản mới của KeyFlow.{!allowed && !applying && ' Thả các nốt và pedal, chờ tiếng đàn kết thúc để cập nhật.'}</p><button className="stop-button" disabled={!allowed || applying} onClick={() => { void offlineManager.applyUpdate() }}>{applying ? 'Đang cập nhật…' : 'Cập nhật KeyFlow'}</button></div>}
    {updateMessage && <p role="status" className="offline-detail">{updateMessage}</p>}
  </aside>
}
