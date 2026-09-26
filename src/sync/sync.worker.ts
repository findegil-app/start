import { db, getKV, setKV } from '../db'
import { GitHubClient, UnauthorizedError, type Credentials } from '../github/client'
import { SyncEngine, type SyncReport } from './engine'
import type { FromWorker, ToWorker } from './protocol'

const post = (msg: FromWorker) => (self as unknown as { postMessage(m: FromWorker): void }).postMessage(msg)

let running = false
let again = false

async function runOnce(creds: Credentials): Promise<SyncReport | null> {
  const exec = () => new SyncEngine(db, new GitHubClient(creds)).run()
  // Web Locks: si hay otra pestaña sincronizando, esta se salta el ciclo.
  if (navigator.locks) {
    return navigator.locks.request('findegil-sync', { ifAvailable: true }, (lock) => (lock ? exec() : null))
  }
  return exec()
}

async function sync() {
  if (running) {
    again = true
    return
  }
  running = true
  try {
    do {
      again = false
      const creds = await getKV<Credentials>('credentials')
      if (!creds?.token) {
        post({ type: 'unauthorized' })
        return
      }
      if (!navigator.onLine) {
        post({ type: 'state', state: 'offline' })
        return
      }
      post({ type: 'state', state: 'syncing' })
      const report = await runOnce(creds)
      const at = new Date().toISOString()
      if (report) await setKV('lastSyncAt', at)
      const error = report?.errors.length ? report.errors.join('\n') : undefined
      post({ type: 'state', state: error ? 'error' : 'idle', at, report: report ?? undefined, error })
    } while (again)
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      post({ type: 'unauthorized' })
    } else {
      post({ type: 'state', state: navigator.onLine ? 'error' : 'offline', error: err instanceof Error ? err.message : String(err) })
    }
  } finally {
    running = false
  }
}

self.addEventListener('message', (e: MessageEvent<ToWorker>) => {
  if (e.data?.type === 'sync') void sync()
})
