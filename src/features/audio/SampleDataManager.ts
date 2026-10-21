import { useSampleDataStore } from '../../stores/sampleDataStore'
import { prepareSamples } from './SampleLoader'

export class SampleDataManager {
  private pending?: Promise<void>
  private controller?: AbortController

  prepare(cacheName?: string): Promise<void> {
    if (this.pending) return this.pending
    if (useSampleDataStore.getState().status === 'ready') return Promise.resolve()
    const controller = new AbortController()
    this.controller = controller
    useSampleDataStore.setState({ status: 'loading', progress: 0, error: null })
    const timer = window.setTimeout(() => controller.abort(), 30000)
    this.pending = prepareSamples(controller.signal, progress => {
      if (!controller.signal.aborted) useSampleDataStore.setState({ progress })
    }, cacheName).then(() => {
      useSampleDataStore.setState({ status: 'ready', progress: 100, error: null })
    }).catch(error => {
      controller.abort()
      useSampleDataStore.setState({ status: 'error', error: error instanceof Error ? error.message : 'Chưa tải được dữ liệu tiếng đàn. Vui lòng thử lại.' })
    }).finally(() => { window.clearTimeout(timer); this.pending = undefined; this.controller = undefined })
    return this.pending
  }

  cancel(): void { this.controller?.abort() }
}
export const sampleDataManager = new SampleDataManager()
