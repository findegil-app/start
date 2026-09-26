import Dexie, { type EntityTable } from 'dexie'

export type SyncStatus = 'synced' | 'pending' | 'deleted'

/** Dónde vive una nota: bandeja de entrada, temporales o dentro de un proyecto/área/recurso. */
export type Bucket = 'inbox' | 'scratch' | 'container'

export type ContainerKind = 'project' | 'area' | 'resource'

export interface Note {
  /** UUID estable (se guarda en el frontmatter; el archivo se nombra por título). */
  id: string
  title: string
  /** Cuerpo de la nota en Markdown (sin frontmatter). */
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
  bucket: Bucket
  /** Proyecto/área/recurso cuando bucket === 'container'. */
  containerId: string | null
  /** Fecha límite (ISO). Fechas sin hora se guardan como YYYY-MM-DD. */
  due: string | null
  /** Momento del aviso (ISO con hora). */
  remind: string | null
  done: boolean
  syncStatus: SyncStatus
  /** Ruta actual en el repo (p. ej. 01 Projects/Web/Idea.md); null si nunca se ha subido. */
  remotePath: string | null
  /** SHA del blob en GitHub la última vez que local y remoto coincidieron. */
  remoteSha: string | null
  /** Contador de revisiones locales; evita marcar como sincronizada una nota editada durante un sync. */
  rev: number
  /** Claves de frontmatter desconocidas, preservadas en el round-trip. */
  extra?: Record<string, unknown>
}

/** Proyecto, área o recurso (PARA). Archivado = status 'archived' (vive en 04 Archive/). */
export interface Container {
  id: string
  kind: ContainerKind
  name: string
  status: 'active' | 'archived'
  /** Solo proyectos: fecha límite (opcional pero sugerida). */
  deadline: string | null
  description: string
  createdAt: string
  updatedAt: string
  syncStatus: SyncStatus
  /** Carpeta actual en el repo; null si nunca se ha subido. */
  remotePath: string | null
  /** SHA del archivo de metadatos (_project.md…) en el repo. */
  remoteSha: string | null
  rev: number
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
  containers: EntityTable<Container, 'id'>
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
          if (n.remoteSha && n.syncStatus === 'synced') n.syncStatus = 'pending'
        }),
    )
  // v3: PARA. Las notas existentes van a la Landing Zone y se re-suben para moverlas de carpeta.
  db.version(3)
    .stores({
      notes: 'id, updatedAt, syncStatus, remotePath, bucket, containerId, due, *tags',
      containers: 'id, kind, status, syncStatus',
    })
    .upgrade((tx) =>
      tx
        .table('notes')
        .toCollection()
        .modify((n: Note) => {
          n.bucket = 'inbox'
          n.containerId = null
          n.due = null
          n.remind = null
          n.done = false
          if (n.syncStatus === 'synced') n.syncStatus = 'pending'
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
