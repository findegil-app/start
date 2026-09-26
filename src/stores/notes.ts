import { liveQuery } from 'dexie'
import { onScopeDispose, ref, watch, type Ref } from 'vue'
import { db, type Note } from '../db'
import { assetRef } from '../lib/paths'
import { compressImage } from '../lib/image'
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

export type NoteSummary = Pick<Note, 'id' | 'title' | 'tags' | 'updatedAt' | 'syncStatus'> & { excerpt: string }

function excerpt(content: string): string {
  return content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/[#>*_`~\-[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)
}

export function useNoteList(search: Ref<string>) {
  return useLiveQuery(
    async (): Promise<NoteSummary[]> => {
      const terms = search.value.toLowerCase().split(/\s+/).filter(Boolean)
      const notes = await db.notes.orderBy('updatedAt').reverse().filter((n) => n.syncStatus !== 'deleted').toArray()
      return notes
        .filter((n) => {
          if (!terms.length) return true
          const hay = `${n.title}\n${n.tags.join(' ')}\n${n.content}`.toLowerCase()
          return terms.every((t) => (t.startsWith('#') ? n.tags.some((tag) => tag.toLowerCase() === t.slice(1)) : hay.includes(t)))
        })
        .map((n) => ({ id: n.id, title: n.title, tags: n.tags, updatedAt: n.updatedAt, syncStatus: n.syncStatus, excerpt: excerpt(n.content) }))
    },
    () => search.value,
  )
}

export function usePendingCount() {
  return useLiveQuery(async () => {
    const [notes, assets] = await Promise.all([
      db.notes.where('syncStatus').anyOf('pending', 'deleted').count(),
      db.assets.where('syncStatus').equals('pending').count(),
    ])
    return notes + assets
  })
}

export function useNote(id: Ref<string>) {
  return useLiveQuery(
    async () => {
      const note = await db.notes.get(id.value)
      return note && note.syncStatus !== 'deleted' ? note : null
    },
    () => id.value,
  )
}

export async function createNote(): Promise<string> {
  const now = new Date().toISOString()
  const note: Note = {
    id: crypto.randomUUID(),
    title: '',
    content: '',
    tags: [],
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
    remoteSha: null,
    rev: 1,
  }
  await db.notes.add(note)
  requestSync(EDIT_DEBOUNCE_MS)
  return note.id
}

/** Escritura local inmediata + marca pending. La UI no espera a la red. */
export async function updateNote(id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'tags'>>) {
  await db.transaction('rw', db.notes, async () => {
    const note = await db.notes.get(id)
    if (!note || note.syncStatus === 'deleted') return
    const changed = (Object.keys(patch) as (keyof typeof patch)[]).some(
      (k) => JSON.stringify(note[k]) !== JSON.stringify(patch[k]),
    )
    if (!changed) return
    await db.notes.update(id, {
      ...patch,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
      rev: note.rev + 1,
    })
  })
  requestSync(EDIT_DEBOUNCE_MS)
}

export async function deleteNote(id: string) {
  await db.transaction('rw', db.notes, async () => {
    const note = await db.notes.get(id)
    if (!note) return
    // Nunca subida y sin SHA remoto: basta con borrarla localmente... salvo que haya un PUT en vuelo;
    // el tombstone cubre ambos casos y el worker lo limpia.
    await db.notes.update(id, { syncStatus: 'deleted', rev: note.rev + 1, updatedAt: new Date().toISOString() })
  })
  requestSync()
}

/** Comprime la imagen a WebP, la guarda en IndexedDB y devuelve la referencia Markdown. */
export async function addImage(file: Blob): Promise<string> {
  const { blob, mime, ext } = await compressImage(file)
  const path = `assets/${crypto.randomUUID()}.${ext}`
  await db.assets.add({ path, blob, mime, syncStatus: 'pending', remoteSha: null, createdAt: new Date().toISOString() })
  requestSync(EDIT_DEBOUNCE_MS)
  return assetRef(path)
}
