import { reactive } from 'vue'
import { db, type Container, type ContainerKind } from '../db'
import { requestSync } from '../sync/controller'
import { useLiveQuery } from './notes'

const byName = (a: Container, b: Container) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
/** Proyectos: primero los que tienen fecha más cercana. */
const byDeadline = (a: Container, b: Container) =>
  (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || byName(a, b)

export function useContainers() {
  return useLiveQuery(async () => {
    const all = (await db.containers.toArray()).filter((c) => c.syncStatus !== 'deleted')
    const active = all.filter((c) => c.status === 'active')
    return {
      all,
      byId: new Map(all.map((c) => [c.id, c])),
      project: active.filter((c) => c.kind === 'project').sort(byDeadline),
      area: active.filter((c) => c.kind === 'area').sort(byName),
      resource: active.filter((c) => c.kind === 'resource').sort(byName),
      archived: all.filter((c) => c.status === 'archived').sort(byName),
    }
  })
}

export function useContainer(id: () => string | null) {
  return useLiveQuery(
    async () => {
      const cid = id()
      if (!cid) return null
      const c = await db.containers.get(cid)
      return c && c.syncStatus !== 'deleted' ? c : null
    },
    id,
  )
}

export async function createContainer(kind: ContainerKind, name: string, deadline: string | null = null): Promise<string> {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  await db.containers.add({
    id,
    kind,
    name: name.trim(),
    status: 'active',
    deadline: kind === 'project' ? deadline : null,
    description: '',
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
    remotePath: null,
    remoteSha: null,
    rev: 1,
  })
  requestSync(2000)
  return id
}

export async function updateContainer(id: string, patch: Partial<Pick<Container, 'name' | 'deadline' | 'description' | 'status'>>) {
  await db.transaction('rw', db.containers, async () => {
    const c = await db.containers.get(id)
    if (!c) return
    await db.containers.update(id, { ...patch, updatedAt: new Date().toISOString(), syncStatus: 'pending', rev: c.rev + 1 })
  })
  // El worker mueve también las notas si cambia la carpeta (nombre o archivado).
  requestSync(2000)
}

export const archiveContainer = (id: string) => updateContainer(id, { status: 'archived' })
export const restoreContainer = (id: string) => updateContainer(id, { status: 'active' })

/** Solo se pueden borrar contenedores vacíos (lo normal en PARA es archivar). */
export async function deleteContainer(id: string) {
  const count = await db.notes.where('containerId').equals(id).filter((n) => n.syncStatus !== 'deleted').count()
  if (count) throw new Error('Only empty ones can be deleted. Archive it or move its notes first.')
  const c = await db.containers.get(id)
  if (!c) return
  if (!c.remotePath) await db.containers.delete(id)
  else await db.containers.update(id, { syncStatus: 'deleted', rev: c.rev + 1 })
  requestSync()
}

// ---- Diálogos globales (Move to… y crear/editar contenedor)

export const ui = reactive({
  /** Nota que se está moviendo con la paleta "Move to…". */
  moveNoteId: null as string | null,
  /** Diálogo de crear/editar contenedor. */
  containerDialog: null as null | { kind: ContainerKind; id?: string; name?: string; then?: (id: string) => void },
})

export const openMove = (noteId: string) => (ui.moveNoteId = noteId)
export const openContainerDialog = (d: NonNullable<typeof ui.containerDialog>) => (ui.containerDialog = d)
