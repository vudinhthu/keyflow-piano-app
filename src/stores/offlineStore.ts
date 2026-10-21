import { create } from 'zustand'
export type OfflinePhase = 'checking' | 'ready' | 'error' | 'unavailable'
interface OfflineState {
  phase: OfflinePhase
  online: boolean
  message: string
  busy: boolean
  hasUpdate: boolean
  updateAllowed: boolean
  applying: boolean
  updateMessage: string
  verifiedVersion: string | null
}
export const useOfflineStore = create<OfflineState>(() => ({ phase: 'checking', online: true, message: '', busy: false, hasUpdate: false, updateAllowed: false, applying: false, updateMessage: '', verifiedVersion: null }))
