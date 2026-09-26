import { liveQuery } from 'dexie'
import { onScopeDispose, ref, watch, type Ref } from 'vue'
import { db, type Bucket, type Note } from '../db'
import { compressImage } from '../lib/image'
import { assetRef } from '../lib/paths'
import { EDIT_DEBOUNCE_MS, requestSync } from '../sync/controller'

/** Suscribe un ref de Vue a una consulta reactiva de Dexie (se actualiza también con cambios del worker). */
export function useLiveQuery<T>(query: () => Promise<T>, deps: () => unknown = () => null): Ref<T | undefined> {
  const result = ref<T>()
  let sub: { unsubscribe(): void } | undefined
  watch(
    deps,
    () => {
      sub?.unsubscribe()
      sub = liveQuery(query).subscribe({
        next: (v) => (result.value = v),
        error: (e) => console.error('[findegil] liveQuery', e),
      })
    },
    { immediate: true },
  )
  onScopeDispose(() => sub?.unsubscribe())
  return result as Ref<T | undefined>
}

/** Ubicación de una nota dentro de PARA. */
export type Location = { bucket: 'inbox' } | { bucket: 'scratch' } | { bucket: 'container'; containerId: string }

export const locationOf = (n: Pick<Note, 'bucket' | 'containerId'>): Location =>
  n.bucket === 'container' && n.containerId ? { bucket: 'container', containerId: n.containerId } : { bucket: n.bucket as 'inbox' | 'scratch' }

export type NoteSummary = Pick<Note, 'id' | 'title' | 'tags' | 'updatedAt' | 'syncStatus' | 'due' | 'remind' | 'done' | 'bucket' | 'containerId'> & {
  excerpt: string
}

function excerpt(content: string): string {
  return content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/^\s*>\s*\[![A-Z]+\]\s*$/gim, '')
    .replace(/@\[embed\]\(([^)]*)\)/g, '▶ $1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\$+/g, '')
    .replace(/\\/g, '')
    .replace(/^\s*\|?\s*:?-{3,}.*$/gm, '')
    .replace(/^\s*[-*]\s+\[[ xX]\]\s*/gm, '')
    .replace(/```[\w-]*/g, '')
    .replace(/[#>*_`~\-[\]()|=]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)
}

const summary = (n: Note): NoteSummary => ({
  id: n.id,
  title: n.title,
  tags: n.tags,
  updatedAt: n.updatedAt,
  syncStatus: n.syncStatus,
  due: n.due,
  remind: n.remind,
  done: n.done,
  bucket: n.bucket,
  containerId: n.containerId,
  excerpt: excerpt(n.content),
})

function matches(n: Note, terms: string[]) {
  if (!terms.length) return true
  const hay = `${n.title}\n${n.tags.join(' ')}\n${n.content}`.toLowerCase()
  return terms.every((t) => (t.startsWith('#') ? n.tags.some((tag) => tag.toLowerCase() === t.slice(1)) : hay.includes(t)))
}

/** Notas de una ubicación, más recientes primero; las hechas al final. */
export function useNotesIn(location: Ref<Location | null>, search: Ref<string>) {
  return useLiveQuery(
    async (): Promise<NoteSummary[]> => {
      const loc = location.value
      if (!loc) return []
      const terms = search.value.toLowerCase().split(/\s+/).filter(Boolean)
      const rows =
        loc.bucket === 'container'
          ? await db.notes.where('containerId').equals(loc.containerId).toArray()
          : await db.notes.where('bucket').equals(loc.bucket).toArray()
      return rows
        .filter((n) => n.syncStatus !== 'deleted' && (loc.bucket !== 'container' || n.bucket === 'container') && matches(n, terms))
        .sort((a, b) => Number(a.done) - Number(b.done) || b.updatedAt.localeCompare(a.updatedAt))
        .map(summary)
    },
    () => [JSON.stringify(location.value), search.value],
  )
}

/** Recuento de notas por ubicación (para los contadores de la barra lateral). */
export function useCounts() {
  return useLiveQuery(async () => {
    const counts = { inbox: 0, scratch: 0, pending: 0, byContainer: new Map<string, number>() }
    await db.notes.each((n) => {
      if (n.syncStatus !== 'synced') counts.pending++
      if (n.syncStatus === 'deleted') return
      if (n.bucket === 'inbox') counts.inbox++
      else if (n.bucket === 'scratch') counts.scratch++
      else if (n.containerId) counts.byContainer.set(n.containerId, (counts.byContainer.get(n.containerId) ?? 0) + 1)
    })
    counts.pending += await db.assets.where('syncStatus').equals('pending').count()
    counts.pending += await db.containers.where('syncStatus').anyOf('pending', 'deleted').count()
    return counts
  })
}

export function usePendingCount() {
  return useLiveQuery(async () => {
    const [notes, assets, containers] = await Promise.all([
      db.notes.where('syncStatus').anyOf('pending', 'deleted').count(),
      db.assets.where('syncStatus').equals('pending').count(),
      db.containers.where('syncStatus').anyOf('pending', 'deleted').count(),
    ])
    return notes + assets + containers
  })
}

export function useNote(id: Ref<string | null>) {
  return useLiveQuery(
    async () => {
      if (!id.value) return null
      const note = await db.notes.get(id.value)
      return note && note.syncStatus !== 'deleted' ? note : null
    },
    () => id.value,
  )
}

export async function createNote(location: Location = { bucket: 'inbox' }, fields: Partial<Pick<Note, 'title' | 'content' | 'due' | 'remind'>> = {}): Promise<string> {
  const now = new Date().toISOString()
  const note: Note = {
    id: crypto.randomUUID(),
    title: '',
    content: '',
    tags: [],
    createdAt: now,
    updatedAt: now,
    bucket: location.bucket as Bucket,
    containerId: location.bucket === 'container' ? location.containerId : null,
    due: null,
    remind: null,
    done: false,
    syncStatus: 'pending',
    remotePath: null,
    remoteSha: null,
    rev: 1,
    ...fields,
  }
  await db.notes.add(note)
  requestSync(EDIT_DEBOUNCE_MS)
  return note.id
}

type Editable = Pick<Note, 'title' | 'content' | 'tags' | 'due' | 'remind' | 'done' | 'bucket' | 'containerId'>

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Escritura local inmediata + marca pending. La UI no espera a la red. */
export async function updateNote(id: string, patch: Partial<Editable>, syncDelay = EDIT_DEBOUNCE_MS) {
  await db.transaction('rw', db.notes, async () => {
    const note = await db.notes.get(id)
    if (!note || note.syncStatus === 'deleted') return
    const changed = (Object.keys(patch) as (keyof Editable)[]).some((k) => JSON.stringify(note[k]) !== JSON.stringify(patch[k]))
    if (!changed) return
    const now = new Date().toISOString()
    await db.notes.update(id, { ...patch, updatedAt: now, syncStatus: 'pending', rev: note.rev + 1 })

    // Renombrar una nota actualiza los [[enlaces]] que apuntan a ella en el resto de notas.
    const oldTitle = note.title.trim()
    const newTitle = patch.title?.trim()
    if (oldTitle && newTitle && oldTitle !== newTitle) {
      const re = new RegExp(`\\[\\[${escapeRe(oldTitle)}\\]\\]`, 'gi')
      await db.notes
        .filter((n) => n.id !== id && n.syncStatus !== 'deleted' && re.test(n.content))
        .modify((n) => {
          n.content = n.content.replace(re, `[[${newTitle}]]`)
          n.updatedAt = now
          n.syncStatus = 'pending'
          n.rev += 1
        })
    }
  })
  requestSync(syncDelay)
}

/** Clasificar: mover a la Landing Zone, Scratch o un proyecto/área/recurso. */
export function moveNote(id: string, to: Location) {
  return updateNote(id, { bucket: to.bucket as Bucket, containerId: to.bucket === 'container' ? to.containerId : null }, 2000)
}

/** Margen para deshacer un borrado antes de que el worker lo suba a GitHub. */
export const UNDO_WINDOW_MS = 8000

export async function deleteNote(id: string) {
  await db.transaction('rw', db.notes, async () => {
    const note = await db.notes.get(id)
    if (!note) return
    // Tombstone: el worker borra el archivo remoto y luego la fila.
    await db.notes.update(id, { syncStatus: 'deleted', rev: note.rev + 1, updatedAt: new Date().toISOString() })
  })
  requestSync(UNDO_WINDOW_MS + 2000)
}

/** Deshace un borrado mientras el tombstone siga en local (se re-sube tal cual, sin cambios reales). */
export async function restoreNote(id: string) {
  await db.transaction('rw', db.notes, async () => {
    const note = await db.notes.get(id)
    if (note?.syncStatus === 'deleted') await db.notes.update(id, { syncStatus: 'pending', rev: note.rev + 1 })
  })
  requestSync(EDIT_DEBOUNCE_MS)
}

/** Comprime la imagen a WebP, la guarda en IndexedDB y devuelve la referencia Markdown. */
export async function addImage(file: Blob): Promise<string> {
  const { blob, mime, ext } = await compressImage(file)
  const path = `assets/${crypto.randomUUID()}.${ext}`
  await db.assets.add({ path, blob, mime, syncStatus: 'pending', remoteSha: null, createdAt: new Date().toISOString() })
  requestSync(EDIT_DEBOUNCE_MS)
  return assetRef(path)
}
