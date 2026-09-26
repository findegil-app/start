import type { Router } from 'vue-router'
import { db, type Note } from '../db'
import { noteLinkHost } from '../editor/extensions/NoteLink'
import { KIND_PLURAL } from '../lib/para'
import { createNote } from './notes'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const alive = (n: Note) => n.syncStatus !== 'deleted'

export async function findNoteByTitle(title: string): Promise<Note | undefined> {
  const t = norm(title)
  return db.notes.filter((n) => alive(n) && norm(n.title) === t).first()
}

export async function locationLabel(n: Pick<Note, 'bucket' | 'containerId'>): Promise<string> {
  if (n.bucket === 'inbox') return 'Landing Zone'
  if (n.bucket === 'scratch') return 'Scratch'
  const c = n.containerId ? await db.containers.get(n.containerId) : undefined
  if (!c) return ''
  return `${c.status === 'archived' ? 'Archive › ' : ''}${KIND_PLURAL[c.kind]} › ${c.name}`
}

/** Ruta que abre una nota dentro de su sección. */
export function routeForNote(n: Pick<Note, 'id' | 'bucket' | 'containerId'>) {
  if (n.bucket === 'container' && n.containerId) return { name: 'container', params: { cid: n.containerId }, query: { n: n.id } }
  return { name: n.bucket === 'scratch' ? 'scratch' : 'inbox', query: { n: n.id } }
}

/** Conecta los enlaces [[…]] del editor con la base de datos y el router. */
export function installNoteLinkHost(router: Router) {
  noteLinkHost.search = async (query) => {
    const q = norm(query)
    const notes = await db.notes.filter((n) => alive(n) && !!n.title.trim() && (!q || norm(n.title).includes(q))).toArray()
    notes.sort((a, b) => Number(norm(b.title).startsWith(q)) - Number(norm(a.title).startsWith(q)) || b.updatedAt.localeCompare(a.updatedAt))
    return Promise.all(notes.slice(0, 8).map(async (n) => ({ title: n.title.trim(), where: await locationLabel(n) })))
  }
  noteLinkHost.exists = async (title) => !!(await findNoteByTitle(title))
  noteLinkHost.create = async (title) => {
    if (!(await findNoteByTitle(title))) await createNote({ bucket: 'inbox' }, { title })
  }
  noteLinkHost.open = async (title) => {
    let note = await findNoteByTitle(title)
    if (!note) {
      await createNote({ bucket: 'inbox' }, { title })
      note = await findNoteByTitle(title)
    }
    if (note) await router.push(routeForNote(note))
  }
}

/** Notas que enlazan a este título (para "Linked from"). */
export async function backlinks(title: string, selfId: string) {
  const t = title.trim()
  if (!t) return []
  const re = new RegExp(`\\[\\[${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\]`, 'i')
  const notes = await db.notes.filter((n) => alive(n) && n.id !== selfId && re.test(n.content)).toArray()
  return Promise.all(notes.map(async (n) => ({ id: n.id, title: n.title || 'Untitled', where: await locationLabel(n), route: routeForNote(n) })))
}
