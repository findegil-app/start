import Dexie, { type EntityTable } from 'dexie'

export type SyncStatus = 'synced' | 'pending' | 'deleted'

export interface Note {
  /** UUID estable (se guarda en el frontmatter; el archivo se nombra por título). */
  id: string
  title: string
  /** Cuerpo de la nota en Markdown (sin frontmatter). */
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
  syncStatus: SyncStatus
  /** Ruta actual en el repo (notes/<Título>.md); null si nunca se ha subido. */
  remotePath: string | null
  /** SHA del blob en GitHub la última vez que local y remoto coincidieron. */
  remoteSha: string | null
  /** Contador de revisiones locales; evita marcar como sincronizada una nota editada durante un sync. */
  rev: number
  /** Claves de frontmatter desconocidas, preservadas en el round-trip. */
  extra?: Record<string, unknown>
}

export interface Asset {
  /** Ruta en el repo remoto, p. ej. assets/<uuid>.webp */
  path: string
  blob: Blob
  mime: string
  syncStatus: Exclude<SyncStatus, 'deleted'>
  remoteSha: string | null
  createdAt: string
}

export interface KV {
  key: string
  value: unknown
}

export type FindegilDB = Dexie & {
  notes: EntityTable<Note, 'id'>
  assets: EntityTable<Asset, 'path'>
  kv: EntityTable<KV, 'key'>
}

export function createDb(name = 'findegil'): FindegilDB {
  const db = new Dexie(name) as FindegilDB
  db.version(1).stores({
    notes: 'id, updatedAt, syncStatus, *tags',
    assets: 'path, syncStatus',
    kv: 'key',
  })
  // v2: los archivos pasan de notes/<id>.md a notes/<Título>.md → se guarda la ruta remota.
  db.version(2)
    .stores({ notes: 'id, updatedAt, syncStatus, remotePath, *tags' })
    .upgrade((tx) =>
      tx
        .table('notes')
        .toCollection()
        .modify((n: Note) => {
          n.remotePath = n.remoteSha ? `notes/${n.id}.md` : null
          // Se re-sube para que el archivo se renombre al título.
          if (n.remoteSha && n.syncStatus === 'synced') n.syncStatus = 'pending'
        }),
    )
  return db
}

export const db = createDb()

export async function getKV<T>(key: string, database: FindegilDB = db): Promise<T | undefined> {
  return (await database.kv.get(key))?.value as T | undefined
}

export async function setKV(key: string, value: unknown, database: FindegilDB = db): Promise<void> {
  await database.kv.put({ key, value })
}

export async function delKV(key: string, database: FindegilDB = db): Promise<void> {
  await database.kv.delete(key)
}
