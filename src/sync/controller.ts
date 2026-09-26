import { reactive } from 'vue'
import { getKV } from '../db'
import type { FromWorker, SyncState, ToWorker } from './protocol'

/** Intervalo del "cron" de sincronización mientras la PWA está activa. */
export const SYNC_INTERVAL_MS = 5 * 60 * 1000
/** Retardo tras una edición local antes de subirla (agrupa ráfagas de cambios). */
export const EDIT_DEBOUNCE_MS = 20 * 1000

export const syncStatus = reactive({
  state: (navigator.onLine ? 'idle' : 'offline') as SyncState,
  lastSyncAt: null as string | null,
  lastError: null as string | null,
})

let worker: Worker | null = null
let interval: ReturnType<typeof setInterval> | undefined
let debounce: ReturnType<typeof setTimeout> | undefined
let onUnauthorized: (() => void) | null = null

function send(msg: ToWorker) {
  worker?.postMessage(msg)
}

function syncNow() {
  clearTimeout(debounce)
  debounce = undefined
  if (!navigator.onLine) {
    syncStatus.state = 'offline'
    return
  }
  send({ type: 'sync' })
}

/** Programa un sync. Con delay > 0 se agrupan peticiones (p. ej. tras cada edición). */
export function requestSync(delayMs = 0) {
  if (!worker) return
  if (delayMs <= 0) return syncNow()
  clearTimeout(debounce)
  debounce = setTimeout(syncNow, delayMs)
}

const handleOnline = () => requestSync()
const handleOffline = () => (syncStatus.state = 'offline')
const handleVisibility = () => {
  if (document.visibilityState === 'visible') requestSync()
}

export async function startSync(unauthorized: () => void) {
  if (worker) return
  onUnauthorized = unauthorized
  syncStatus.lastSyncAt = (await getKV<string>('lastSyncAt')) ?? null

  worker = new Worker(new URL('./sync.worker.ts', import.meta.url), { type: 'module' })
  worker.addEventListener('message', (e: MessageEvent<FromWorker>) => {
    const msg = e.data
    if (msg.type === 'unauthorized') {
      stopSync()
      onUnauthorized?.()
      return
    }
    syncStatus.state = msg.state
    if (msg.at && msg.state !== 'syncing') syncStatus.lastSyncAt = msg.at
    syncStatus.lastError = msg.error ?? null
  })

  interval = setInterval(() => requestSync(), SYNC_INTERVAL_MS)
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  document.addEventListener('visibilitychange', handleVisibility)
  requestSync()
}

export function stopSync() {
  clearInterval(interval)
  clearTimeout(debounce)
  window.removeEventListener('online', handleOnline)
  window.removeEventListener('offline', handleOffline)
  document.removeEventListener('visibilitychange', handleVisibility)
  worker?.terminate()
  worker = null
}
