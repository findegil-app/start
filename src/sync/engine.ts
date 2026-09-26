import type { Container, FindegilDB, Note } from '../db'
import { ConflictError, type GitHubApi, type RepoHead, type TreeChange } from '../github/client'
import { base64ToUtf8, bytesToBase64, gitBlobSha, utf8Bytes } from '../lib/encoding'
import { parseContainer, parseNote, serializeContainer, serializeNote } from '../lib/frontmatter'
import { classifyFolder, containerBaseFolder, dirname, META_FILE, noteFolder, parseMetaPath } from '../lib/para'
import { fileNameFromTitle, notePathForTitle, pathMatchesTitle, uniqueFolder } from '../lib/paths'

export interface SyncReport {
  pushed: number
  deletedRemote: number
  pulled: number
  deletedLocal: number
  assetsPushed: number
  errors: string[]
}

const lower = (p: string) => p.toLowerCase()
const isMarkdown = (p: string) => /\.md$/i.test(p)

type Planned<T> = { item: T; path: string; sha: string | null }

/**
 * Motor de sincronización local ⇄ GitHub con estructura PARA.
 *
 * - Push: todos los cambios pendientes (notas, contenedores, imágenes, movimientos entre carpetas y
 *   borrados) se agrupan en UN commit mediante la Git Data API.
 * - Pull: se lee el árbol de la rama y se descargan los blobs cuyo SHA cambió; la carpeta de cada
 *   archivo determina si la nota está en la Landing Zone, Scratch o en un proyecto/área/recurso.
 * - Conflictos: Last-Write-Wins a favor del cambio local (lo pendiente nunca se sobrescribe).
 */
export class SyncEngine {
  private db: FindegilDB
  private gh: GitHubApi

  constructor(db: FindegilDB, gh: GitHubApi) {
    this.db = db
    this.gh = gh
  }

  async run(): Promise<SyncReport> {
    const report: SyncReport = { pushed: 0, deletedRemote: 0, pulled: 0, deletedLocal: 0, assetsPushed: 0, errors: [] }
    let head = await this.gh.getHead()
    let remote = await this.remoteMap(head)
    try {
      head = await this.push(head, remote, report)
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err
      // Otro dispositivo sincronizó a la vez: se repite con la rama actualizada.
      head = await this.gh.getHead()
      remote = await this.remoteMap(head)
      head = await this.push(head, remote, report)
    }
    remote = await this.remoteMap(head)
    await this.pull(remote, report)
    return report
  }

  private async remoteMap(head: RepoHead | null): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    if (!head) return map
    for (const e of await this.gh.getTree(head.treeSha)) if (e.type === 'blob') map.set(e.path, e.sha)
    return map
  }

  // ------------------------------------------------------------------ push

  private async push(head: RepoHead | null, remote: Map<string, string>, report: SyncReport): Promise<RepoHead | null> {
    const [notes, containers, assets] = await Promise.all([
      this.db.notes.toArray(),
      this.db.containers.toArray(),
      this.db.assets.where('syncStatus').equals('pending').toArray(),
    ])

    const takenFiles = new Set([...remote.keys()].map(lower))
    const takenFolders = new Set([...remote.keys()].map((p) => lower(dirname(p))))

    // 1. Carpeta de cada contenedor (se mantiene si sigue cuadrando con nombre/estado).
    const folders = new Map<string, string>()
    const liveContainers = containers.filter((c) => c.syncStatus !== 'deleted')
    for (const c of liveContainers) {
      const base = containerBaseFolder(c)
      if (c.remotePath && pathMatchesFolder(c.remotePath, base)) folders.set(c.id, c.remotePath)
    }
    const used = new Set([...folders.values()].map(lower))
    for (const c of liveContainers) {
      if (folders.has(c.id)) continue
      const folder = uniqueFolder(containerBaseFolder(c), (f) => used.has(f) || (takenFolders.has(f) && lower(c.remotePath ?? '') !== f))
      folders.set(c.id, folder)
      used.add(lower(folder))
    }

    const changes: TreeChange[] = []
    const deletes = new Set<string>()
    const del = (path: string | null) => {
      if (path && remote.has(path)) deletes.add(path)
    }

    // 2. Metadatos de contenedores.
    const plannedContainers: Planned<Container>[] = []
    for (const c of containers) {
      if (c.syncStatus === 'deleted') {
        if (c.remotePath) del(`${c.remotePath}/${META_FILE[c.kind]}`)
        plannedContainers.push({ item: c, path: '', sha: null })
        continue
      }
      const folder = folders.get(c.id)!
      const metaPath = `${folder}/${META_FILE[c.kind]}`
      const moved = c.remotePath !== folder
      if (c.syncStatus !== 'pending' && !moved) continue
      const text = serializeContainer(c)
      const sha = await gitBlobSha(utf8Bytes(text))
      if (remote.get(metaPath) !== sha) changes.push({ path: metaPath, content: text })
      if (moved && c.remotePath) del(`${c.remotePath}/${META_FILE[c.kind]}`)
      plannedContainers.push({ item: c, path: folder, sha })
    }

    // 3. Notas: pendientes, borradas o cuya carpeta ya no es la que les toca (p. ej. su proyecto se archivó).
    const plannedNotes: Planned<Note>[] = []
    const reserved = new Set<string>()
    for (const n of notes) {
      if (n.syncStatus === 'deleted') {
        del(n.remotePath)
        plannedNotes.push({ item: n, path: '', sha: null })
        continue
      }
      const folder = noteFolder(n, folders)
      const inPlace = n.remotePath !== null && pathMatchesTitle(n.remotePath, folder, n.title)
      if (n.syncStatus !== 'pending' && inPlace) {
        reserved.add(lower(n.remotePath!))
        continue
      }
      let path = inPlace ? n.remotePath! : ''
      if (!path) {
        path = notePathForTitle(folder, n.title, (p) => reserved.has(p) || (takenFiles.has(p) && p !== lower(n.remotePath ?? '')))
      }
      reserved.add(lower(path))
      const text = serializeNote(n)
      const sha = await gitBlobSha(utf8Bytes(text))
      if (remote.get(path) !== sha) changes.push({ path, content: text })
      if (n.remotePath && n.remotePath !== path) del(n.remotePath)
      plannedNotes.push({ item: n, path, sha })
    }

    // 4. Imágenes.
    const plannedAssets: Planned<(typeof assets)[number]>[] = []
    for (const a of assets) {
      const bytes = new Uint8Array(await a.blob.arrayBuffer())
      const sha = await gitBlobSha(bytes)
      if (remote.get(a.path) !== sha) changes.push({ path: a.path, blobSha: await this.gh.createBlob(bytesToBase64(bytes)) })
      plannedAssets.push({ item: a, path: a.path, sha })
    }

    // Un archivo que se escribe no se borra (p. ej. intercambio de nombres).
    const written = new Set(changes.map((c) => c.path))
    for (const d of deletes) if (!written.has(d)) changes.push({ path: d, delete: true })

    let newHead = head
    if (changes.length) {
      newHead = await this.gh.commit(head, changes, commitMessage(plannedNotes, plannedContainers, deletes.size))
    }

    // 5. Estado local (solo si nadie editó mientras tanto).
    await this.db.transaction('rw', [this.db.notes, this.db.containers, this.db.assets], async () => {
      for (const { item, path, sha } of plannedNotes) {
        const cur = await this.db.notes.get(item.id)
        if (!cur || cur.rev !== item.rev) {
          if (cur && sha) await this.db.notes.update(item.id, { remotePath: path, remoteSha: sha })
          continue
        }
        if (item.syncStatus === 'deleted') {
          await this.db.notes.delete(item.id)
          report.deletedRemote++
        } else {
          await this.db.notes.update(item.id, { remotePath: path, remoteSha: sha, syncStatus: 'synced' })
          report.pushed++
        }
      }
      for (const { item, path, sha } of plannedContainers) {
        const cur = await this.db.containers.get(item.id)
        if (!cur) continue
        if (cur.rev !== item.rev) {
          if (sha) await this.db.containers.update(item.id, { remotePath: path, remoteSha: sha })
          continue
        }
        if (item.syncStatus === 'deleted') await this.db.containers.delete(item.id)
        else await this.db.containers.update(item.id, { remotePath: path, remoteSha: sha, syncStatus: 'synced' })
      }
      for (const { item, sha } of plannedAssets) {
        await this.db.assets.update(item.path, { syncStatus: 'synced', remoteSha: sha })
        report.assetsPushed++
      }
    })
    return newHead
  }

  // ------------------------------------------------------------------ pull

  private async pull(remote: Map<string, string>, report: SyncReport) {
    // Contenedores: primero sus metadatos, luego carpetas sin metadatos (creadas a mano en GitHub).
    const containers = await this.db.containers.toArray()
    const byFolder = new Map(containers.filter((c) => c.remotePath).map((c) => [c.remotePath!, c]))
    const byId = new Map(containers.map((c) => [c.id, c]))
    const folderToId = new Map<string, string>()
    for (const c of containers) if (c.remotePath && c.syncStatus !== 'deleted') folderToId.set(c.remotePath, c.id)

    const metas = [...remote].filter(([p]) => parseMetaPath(p))
    for (const [path, sha] of metas) {
      const { folder, kind } = parseMetaPath(path)!
      const info = classifyFolder(folder)
      if (info.type !== 'container' || info.kind !== kind) continue
      const local = byFolder.get(folder)
      if (local && (local.syncStatus !== 'synced' || local.remoteSha === sha)) {
        folderToId.set(folder, local.id)
        continue
      }
      try {
        const parsed = parseContainer(base64ToUtf8(await this.gh.getBlob(sha)), info.name)
        const target = local ?? byId.get(parsed.id)
        if (target && target.syncStatus !== 'synced') {
          folderToId.set(folder, target.id)
          continue
        }
        const { hasId, ...fields } = parsed
        const id = target?.id ?? fields.id
        await this.db.containers.put({
          ...fields,
          id,
          kind,
          status: info.archived ? 'archived' : 'active',
          syncStatus: hasId ? 'synced' : 'pending',
          remotePath: folder,
          remoteSha: sha,
          rev: (target?.rev ?? 0) + 1,
        })
        folderToId.set(folder, id)
      } catch (err) {
        this.handleItemError(err, report, path)
      }
    }

    // Carpetas de contenedor con notas pero sin metadatos → se crea el contenedor (y se sube su _meta).
    for (const path of remote.keys()) {
      if (!isMarkdown(path) || parseMetaPath(path)) continue
      const folder = dirname(path)
      const info = classifyFolder(folder)
      if (info.type !== 'container' || folderToId.has(folder)) continue
      const now = new Date().toISOString()
      const id = crypto.randomUUID()
      await this.db.containers.add({
        id,
        kind: info.kind,
        name: info.name,
        status: info.archived ? 'archived' : 'active',
        deadline: null,
        description: '',
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
        remotePath: folder,
        remoteSha: null,
        rev: 1,
      })
      folderToId.set(folder, id)
    }

    // Notas.
    const locals = await this.db.notes.toArray()
    const notesByPath = new Map(locals.filter((n) => n.remotePath).map((n) => [n.remotePath!, n]))
    const notesById = new Map(locals.map((n) => [n.id, n]))

    for (const [path, sha] of remote) {
      if (!isMarkdown(path) || parseMetaPath(path) || !path.includes('/')) continue
      const folder = dirname(path)
      const info = classifyFolder(folder)
      const location: Pick<Note, 'bucket' | 'containerId'> =
        info.type === 'scratch'
          ? { bucket: 'scratch', containerId: null }
          : info.type === 'container' && folderToId.has(folder)
            ? { bucket: 'container', containerId: folderToId.get(folder)! }
            : { bucket: 'inbox', containerId: null }
      // Carpetas desconocidas (p. ej. la antigua notes/) → Landing Zone, y se re-sube para moverla.
      const misplaced = info.type === 'unknown'

      const atPath = notesByPath.get(path)
      if (atPath && (atPath.syncStatus !== 'synced' || atPath.remoteSha === sha)) continue
      try {
        const parsed = parseNote(base64ToUtf8(await this.gh.getBlob(sha)), path)
        let local = atPath
        if (!local) {
          const sameId = notesById.get(parsed.id)
          if (sameId && !(sameId.remotePath && sameId.remotePath !== path && remote.has(sameId.remotePath))) local = sameId
          else if (sameId) parsed.id = crypto.randomUUID()
        }
        if (local && local.syncStatus !== 'synced') continue

        const { hasId, ...fields } = parsed
        const id = local?.id ?? fields.id
        const applied = await this.db.transaction('rw', this.db.notes, async () => {
          const cur = await this.db.notes.get(id)
          if (cur && (cur.syncStatus !== 'synced' || cur.rev !== local?.rev)) return false
          await this.db.notes.put({
            ...fields,
            ...location,
            id,
            due: fields.due ?? null,
            remind: fields.remind ?? null,
            done: fields.done ?? false,
            remotePath: path,
            remoteSha: sha,
            syncStatus: hasId && !misplaced ? 'synced' : 'pending',
            rev: (cur?.rev ?? 0) + 1,
          })
          return true
        })
        if (applied) report.pulled++
      } catch (err) {
        this.handleItemError(err, report, path)
      }
    }

    // Borrados remotos: notas y contenedores sincronizados cuyo archivo ya no existe.
    const synced = await this.db.notes.where('syncStatus').equals('synced').toArray()
    for (const note of synced) {
      if (!note.remotePath || remote.has(note.remotePath)) continue
      await this.db.transaction('rw', this.db.notes, async () => {
        const cur = await this.db.notes.get(note.id)
        if (cur && cur.syncStatus === 'synced' && cur.rev === note.rev && cur.remotePath === note.remotePath) {
          await this.db.notes.delete(note.id)
          report.deletedLocal++
        }
      })
    }
    const remoteFolders = new Set([...remote.keys()].map(dirname))
    for (const c of await this.db.containers.where('syncStatus').equals('synced').toArray()) {
      if (!c.remotePath || remoteFolders.has(c.remotePath)) continue
      const hasNotes = (await this.db.notes.where('containerId').equals(c.id).count()) > 0
      if (!hasNotes) await this.db.containers.delete(c.id)
    }
  }

  /** Los errores por elemento no abortan el ciclo, salvo 401 (hay que parar y pedir login). */
  private handleItemError(err: unknown, report: SyncReport, item: string) {
    if (err instanceof Error && err.name === 'UnauthorizedError') throw err
    report.errors.push(`${item}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function pathMatchesFolder(folder: string, base: string): boolean {
  if (lower(folder) === lower(base)) return true
  const suffix = folder.slice(base.length)
  return lower(folder.slice(0, base.length)) === lower(base) && /^ \(\d+\)$/.test(suffix)
}

function commitMessage(notes: Planned<Note>[], containers: Planned<Container>[], deletes: number): string {
  const label = (n: Note) => fileNameFromTitle(n.title)
  const live = notes.filter((n) => n.item.syncStatus !== 'deleted')
  const removed = notes.length - live.length
  if (notes.length === 1 && !containers.length) {
    const n = notes[0].item
    if (n.syncStatus === 'deleted') return `delete: ${label(n)}`
    if (!n.remotePath) return `create: ${label(n)}`
    return n.remotePath !== notes[0].path ? `move: ${label(n)} → ${notes[0].path}` : `update: ${label(n)}`
  }
  const parts = []
  if (live.length) parts.push(`${live.length} ${live.length === 1 ? 'nota' : 'notas'}`)
  if (removed) parts.push(`${removed} ${removed === 1 ? 'borrada' : 'borradas'}`)
  if (containers.length) parts.push(`${containers.length} ${containers.length === 1 ? 'contenedor' : 'contenedores'}`)
  if (!parts.length && deletes) parts.push(`${deletes} archivos borrados`)
  return `sync: ${parts.join(', ') || 'imágenes'}`
}
