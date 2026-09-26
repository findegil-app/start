import type { SyncReport } from './engine'

export type SyncState = 'idle' | 'syncing' | 'error' | 'offline'

export type ToWorker = { type: 'sync' }

export type FromWorker =
  | { type: 'state'; state: SyncState; at?: string; report?: SyncReport; error?: string }
  | { type: 'unauthorized' }
