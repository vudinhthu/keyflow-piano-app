import { usePianoStore } from '../../stores/pianoStore'
import { useOfflineStore } from '../../stores/offlineStore'
import { isVerified, updateIsQuiet, workerRequest, type CacheStatus } from './protocol'
import { sampleDataManager } from '../audio/SampleDataManager'

export class OfflineManager {
  private registration?: ServiceWorkerRegistration
  private running = false
  private generation = 0
  private requestId = 0
  private lastActivity = 0
  private quietTimer?: number
  private applyTimer?: number
  private refreshTimer?: number
  private applyingVersion?: string
  private abort = new AbortController()
  private installError?: string
  private readonly registrationCleanups: Array<() => void> = []
  private readonly cleanups: Array<() => void> = []

  start(): () => void {
    this.running = true
    this.abort = new AbortController()
    const generation = ++this.generation
    this.lastActivity = performance.now()
    useOfflineStore.setState({ online: navigator.onLine })
    if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) {
      useOfflineStore.setState({ phase: 'unavailable', message: import.meta.env.DEV ? 'Offline được kiểm tra trong bản production.' : 'Trình duyệt này chưa hỗ trợ lưu offline.' })
      return () => { this.running = false }
    }
    const listen = (target: EventTarget, type: string, listener: EventListener) => {
      target.addEventListener(type, listener); this.cleanups.push(() => target.removeEventListener(type, listener))
    }
    const refresh = () => { void this.refresh() }
    listen(window, 'online', () => { useOfflineStore.setState({ online: true }); refresh() })
    listen(window, 'offline', () => { useOfflineStore.setState({ online: false }); refresh() })
    listen(window, 'focus', refresh)
    listen(document, 'visibilitychange', () => { if (!document.hidden) refresh() })
    listen(navigator.serviceWorker, 'message', event => {
      const data = (event as MessageEvent).data
      if (data?.type === 'CACHE_INSTALL_FAILED') {
        if (!this.registration?.active) { this.installError = data.errorCode; useOfflineStore.setState({ phase: 'error', busy: false, message: this.errorMessage(data.errorCode) }) }
        else useOfflineStore.setState({ updateMessage: 'Chưa tải được bản mới. Phiên hiện tại vẫn dùng được.' })
      }
      if (data?.type === 'CACHE_INVALIDATED' || data?.type === 'CACHE_CHANGED') {
        if (data.type === 'CACHE_INVALIDATED') useOfflineStore.setState({ phase: 'checking' })
        window.clearTimeout(this.refreshTimer)
        this.refreshTimer = window.setTimeout(refresh, 50)
      }
      if (data?.type === 'PREPARE_UPDATE' && (event as MessageEvent).ports[0]) {
        const idle = this.running && useOfflineStore.getState().applying && usePianoStore.getState().inputBlocked && data.version === this.applyingVersion && updateIsQuiet(usePianoStore.getState(), this.lastActivity, performance.now())
        ;(event as MessageEvent).ports[0].postMessage({ idle })
      }
    })
    listen(navigator.serviceWorker, 'controllerchange', () => {
      if (useOfflineStore.getState().applying) window.location.reload()
      else refresh()
    })
    this.cleanups.push(usePianoStore.subscribe((state, previous) => {
      if (state.activeNotes !== previous.activeNotes || state.sustainedNotes !== previous.sustainedNotes || state.sustain !== previous.sustain || state.status !== previous.status) {
        this.lastActivity = performance.now(); this.updateQuiet()
      }
    }))
    const timer = window.setInterval(() => { if (!document.hidden && !useOfflineStore.getState().busy && !useOfflineStore.getState().applying) refresh() }, 30000)
    this.cleanups.push(() => window.clearInterval(timer))
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then(registration => {
      if (!this.running || generation !== this.generation) return
      this.bindRegistration(registration, generation)
      this.updateQuiet(); refresh()
      void navigator.serviceWorker.ready.then(() => { if (this.running && generation === this.generation) refresh() })
    }).catch(() => { if (this.running && generation === this.generation) useOfflineStore.setState({ phase: 'error', message: 'Chưa đăng ký được chế độ offline. Kết nối mạng rồi thử lại.' }) })
    return () => {
      this.running = false; this.generation++; this.requestId++
      this.cleanups.splice(0).forEach(cleanup => cleanup())
      this.registrationCleanups.splice(0).forEach(cleanup => cleanup())
      window.clearTimeout(this.quietTimer); window.clearTimeout(this.applyTimer); window.clearTimeout(this.refreshTimer)
      this.abort.abort()
      usePianoStore.setState({ inputBlocked: false })
      useOfflineStore.setState({ applying: false, busy: false })
    }
  }

  private bindRegistration(registration: ServiceWorkerRegistration, generation: number): void {
    if (this.registration === registration && this.registrationCleanups.length) return
    this.registrationCleanups.splice(0).forEach(cleanup => cleanup())
    this.registration = registration
    const listen = (target: EventTarget, type: string, listener: EventListener) => {
      target.addEventListener(type, listener); this.registrationCleanups.push(() => target.removeEventListener(type, listener))
    }
    const watch = () => {
      const installing = registration.installing
      if (!installing) return
      listen(installing, 'statechange', () => {
        if (!this.running || generation !== this.generation) return
        if (installing.state === 'redundant' && !registration.active) useOfflineStore.setState({ phase: 'error', busy: false, message: this.errorMessage(this.installError) })
        if (installing.state === 'installed' || installing.state === 'activated') {
          useOfflineStore.setState({ updateMessage: '' })
          this.updateQuiet(); void this.refresh()
        }
      })
    }
    listen(registration, 'updatefound', watch); watch()
  }

  private errorMessage(code?: string): string {
    return code === 'quota' ? 'Trình duyệt chưa đủ dung lượng để lưu offline. Dọn bộ nhớ trang rồi thử lại.' : 'Chưa lưu đủ ứng dụng và tiếng đàn. Kết nối mạng rồi thử lại.'
  }
  private updateQuiet(): void {
    if (!this.running) return
    const hasUpdate = Boolean(this.registration?.waiting)
    const allowed = hasUpdate && updateIsQuiet(usePianoStore.getState(), this.lastActivity, performance.now())
    useOfflineStore.setState({ hasUpdate, updateAllowed: allowed })
    window.clearTimeout(this.quietTimer)
    if (hasUpdate && !allowed) this.quietTimer = window.setTimeout(() => this.updateQuiet(), 1100)
  }

  async refresh(repair = false): Promise<void> {
    if (!this.running || useOfflineStore.getState().applying) return
    const id = ++this.requestId
    const generation = this.generation
    useOfflineStore.setState({ phase: 'checking', busy: true })
    try {
      let registration = this.registration || await navigator.serviceWorker.getRegistration()
      if (!registration) registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
      if (!this.running || id !== this.requestId || generation !== this.generation) return
      this.bindRegistration(registration, generation)
      if (!registration.active) {
        if (repair) {
          this.installError = undefined
          registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
          if (!this.running || generation !== this.generation) return
          this.bindRegistration(registration, generation)
        }
        useOfflineStore.setState({ phase: registration.installing ? 'checking' : 'error', busy: Boolean(registration.installing), message: this.errorMessage(this.installError) })
        return
      }
      const status = await workerRequest<CacheStatus>(registration.active, repair ? 'REPAIR_CACHE' : 'VERIFY_CACHE', {}, 20000, this.abort.signal)
      if (!this.running || id !== this.requestId || generation !== this.generation) return
      if (isVerified(status, __KEYFLOW_BUILD_ID__)) {
        useOfflineStore.setState({ phase: 'ready', busy: false, message: '', verifiedVersion: status.version! })
        // Restore persisted bytes before Start, even on the first uncontrolled page.
        void sampleDataManager.prepare(`keyflow-piano-v1-${status.version}`)
      }
      else useOfflineStore.setState({ phase: 'error', busy: false, verifiedVersion: null, message: status.ready ? 'Bản đang mở khác bản đã lưu. Hãy cập nhật khi không chơi.' : this.errorMessage(status.errorCode) })
      if (repair && navigator.onLine) {
        try {
          const next = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
          if (this.running && generation === this.generation) this.bindRegistration(next, generation)
        } catch { /* Update discovery cannot invalidate an already verified cache. */ }
      }
    } catch {
      if (this.running && id === this.requestId && generation === this.generation) useOfflineStore.setState({ phase: 'error', busy: false, message: this.errorMessage() })
    } finally { if (this.running && generation === this.generation) this.updateQuiet() }
  }

  async checkForUpdates(): Promise<void> {
    if (!navigator.onLine || !this.registration) return
    let timeout: number | undefined
    try {
      await Promise.race([this.registration.update(), new Promise(resolve => { timeout = window.setTimeout(resolve, 5000) })])
    } catch { /* The saved build can still reload offline. */ }
    finally { window.clearTimeout(timeout) }
  }

  async applyUpdate(): Promise<void> {
    if (!this.registration?.waiting || !updateIsQuiet(usePianoStore.getState(), this.lastActivity, performance.now()) || useOfflineStore.getState().applying) return
    const generation = this.generation
    const waiting = this.registration.waiting
    useOfflineStore.setState({ applying: true, updateMessage: 'Đang kiểm tra bản mới…' })
    usePianoStore.setState({ inputBlocked: true })
    try {
      const status = await workerRequest<CacheStatus>(waiting, 'VERIFY_CACHE', {}, 20000, this.abort.signal)
      if (!this.running || generation !== this.generation) return
      if (!isVerified(status)) throw new Error('incomplete')
      this.applyingVersion = status.version
      const result = await workerRequest<{ applied: boolean; reason?: string }>(waiting, 'APPLY_UPDATE', { version: status.version, idle: true }, 20000, this.abort.signal)
      if (!this.running || generation !== this.generation) return
      if (!result.applied) {
        useOfflineStore.setState({ applying: false, updateMessage: result.reason === 'other-clients' ? 'Đóng các cửa sổ KeyFlow khác rồi thử cập nhật lại.' : 'Chưa thể cập nhật. Thử lại khi bản mới đã tải đủ.' })
        usePianoStore.setState({ inputBlocked: false })
        return
      }
      // controllerchange reloads; timeout recovers if the browser never transitions.
      this.applyTimer = window.setTimeout(() => {
        if (this.running && generation === this.generation && useOfflineStore.getState().applying) {
          useOfflineStore.setState({ applying: false, updateMessage: 'Chưa chuyển được bản mới. Hãy đóng rồi mở lại KeyFlow.' })
          usePianoStore.setState({ inputBlocked: false })
        }
      }, 10000)
    } catch {
      if (!this.running || generation !== this.generation) return
      useOfflineStore.setState({ applying: false, updateMessage: 'Chưa tải đủ bản mới. Kết nối mạng rồi thử lại.' })
      usePianoStore.setState({ inputBlocked: false })
    }
  }
}
export const offlineManager = new OfflineManager()
