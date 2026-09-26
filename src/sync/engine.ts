import type { FindegilDB, Note } from '../db'
import { isStatus, type GitHubApi } from '../github/client'
import { base64ToUtf8, bytesToBase64, gitBlobSha, utf8Bytes } from '../lib/encoding'
import { parseNote, serializeNote } from '../lib/frontmatter'
import { fileNameFromTitle, isNotePath, NOTES_DIR, notePathForTitle } from '../lib/paths'

export interface SyncReport {
  pushed: number
  deletedRemote: number
  pulled: number
  deletedLocal: number
  assetsPushed: number
  errors: string[]
}

const lower = (p: string) => p.toLowerCase()
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** ¿La ruta actual sigue correspondiendo al título? (acepta el sufijo " (n)" de colisiones) */
function pathMatchesTitle(path: string, title: string): boolean {
  const base = escapeRe(fileNameFromTitle(title))
  return new RegExp(`^${NOTES_DIR}/${base}(?: \\(\\d+\\))?\\.md$`, 'i').test(path)
}

const label = (note: Pick<Note, 'title'>) => fileNameFromTitle(note.title)

/**
 * Motor de sincronización local ⇄ GitHub.
 *
 * - Los archivos se nombran por título (notes/<Título>.md); el id estable vive en el frontmatter.
 * - Push: assets y notas pendientes → PUT/DELETE en la Contents API (GET previo del SHA).
 *   Si cambia el título, el archivo se mueve (PUT en la ruta nueva + DELETE de la antigua).
 * - Pull: árbol recursivo de la rama → descarga los blobs cuyo SHA cambió y los empareja por ruta o por id.
 * - Conflictos: Last-Write-Wins a favor del cambio local (las notas pendientes nunca se sobrescriben).
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
    // Assets primero para que las notas que los referencian nunca apunten a archivos inexistentes.
    await this.pushAssets(report)
    await this.pushNotes(report)
    await this.pull(report)
    return report
  }

  private async pushAssets(report: SyncReport) {
    const pending = await this.db.assets.where('syncStatus').equals('pending').toArray()
    for (const asset of pending) {
      try {
        const bytes = new Uint8Array(await asset.blob.arrayBuffer())
        const localSha = await gitBlobSha(bytes)
        const remoteSha = await this.gh.getFileSha(asset.path)
        const sha =
          remoteSha === localSha
            ? remoteSha
            : await this.gh.putFile(asset.path, bytesToBase64(bytes), `asset: ${asset.path}`, remoteSha ?? undefined)
        await this.db.assets.update(asset.path, { syncStatus: 'synced', remoteSha: sha })
        report.assetsPushed++
      } catch (err) {
        this.handleItemError(err, report, asset.path)
      }
    }
  }

  private async pushNotes(report: SyncReport) {
    const pending = await this.db.notes.where('syncStatus').anyOf('pending', 'deleted').toArray()
    if (!pending.length) return

    // Rutas ocupadas (remotas + reservadas por otras notas locales) para resolver colisiones de título.
    const taken = new Set<string>()
    for (const e of await this.gh.getTree()) if (e.type === 'blob' && isNotePath(e.path)) taken.add(lower(e.path))
    for (const n of await this.db.notes.toArray()) if (n.remotePath) taken.add(lower(n.remotePath))

    for (const note of pending) {
      try {
        if (note.syncStatus === 'deleted') {
          await this.pushDelete(note, taken)
          report.deletedRemote++
        } else {
          await this.pushUpsert(note, taken)
          report.pushed++
        }
      } catch (err) {
        this.handleItemError(err, report, label(note))
      }
    }
  }

  private async pushUpsert(note: Note, taken: Set<string>, retry = true): Promise<void> {
    const current = note.remotePath
    const pick = () => notePathForTitle(note.title, (p) => taken.has(p) && p !== (current && lower(current)))
    let path = current && pathMatchesTitle(current, note.title) ? current : pick()

    // GET previo del SHA remoto. Si la ruta nueva existe y no es nuestra, es de otra nota: buscar otra.
    let remoteSha = await this.gh.getFileSha(path)
    while (path !== current && remoteSha) {
      taken.add(lower(path))
      path = pick()
      remoteSha = await this.gh.getFileSha(path)
    }

    const bytes = utf8Bytes(serializeNote(note))
    const localSha = await gitBlobSha(bytes)
    const renamed = current !== null && current !== path
    let newSha: string
    if (remoteSha === localSha) {
      newSha = remoteSha
    } else {
      const message = renamed
        ? `rename: ${current!.slice(NOTES_DIR.length + 1, -3)} → ${label(note)}`
        : `${remoteSha ? 'update' : 'create'}: ${label(note)}`
      try {
        newSha = await this.gh.putFile(path, bytesToBase64(bytes), message, remoteSha ?? undefined)
      } catch (err) {
        // 409/422: el SHA cambió entre el GET y el PUT → reintentar una vez con SHA fresco (LWW).
        if (retry && isStatus(err, 409, 422)) return this.pushUpsert(note, taken, false)
        throw err
      }
    }
    taken.add(lower(path))

    if (renamed) {
      const oldSha = await this.gh.getFileSha(current!)
      if (oldSha) {
        try {
          await this.gh.deleteFile(current!, oldSha, `rename: borrar ${current}`)
        } catch (err) {
          if (!isStatus(err, 404)) throw err
        }
      }
      taken.delete(lower(current!))
    }

    await this.db.transaction('rw', this.db.notes, async () => {
      const cur = await this.db.notes.get(note.id)
      if (!cur) return
      // Si el usuario editó durante la subida, sigue pendiente pero con la ruta/SHA remotos al día.
      const unchanged = cur.rev === note.rev
      await this.db.notes.update(note.id, {
        remotePath: path,
        remoteSha: newSha,
        ...(unchanged ? { syncStatus: 'synced' as const } : {}),
      })
    })
  }

  private async pushDelete(note: Note, taken: Set<string>): Promise<void> {
    if (note.remotePath) {
      const remoteSha = await this.gh.getFileSha(note.remotePath)
      if (remoteSha) {
        try {
          await this.gh.deleteFile(note.remotePath, remoteSha, `delete: ${label(note)}`)
        } catch (err) {
          if (!isStatus(err, 404)) throw err
        }
      }
      taken.delete(lower(note.remotePath))
    }
    await this.db.transaction('rw', this.db.notes, async () => {
      const cur = await this.db.notes.get(note.id)
      if (cur && cur.rev === note.rev) await this.db.notes.delete(note.id)
    })
  }

  private async pull(report: SyncReport) {
    const remote = new Map<string, string>()
    for (const e of await this.gh.getTree()) if (e.type === 'blob' && isNotePath(e.path)) remote.set(e.path, e.sha)

    const locals = await this.db.notes.toArray()
    const byPath = new Map(locals.filter((n) => n.remotePath).map((n) => [n.remotePath!, n]))
    const byId = new Map(locals.map((n) => [n.id, n]))

    for (const [path, sha] of remote) {
      const atPath = byPath.get(path)
      if (atPath && (atPath.syncStatus !== 'synced' || atPath.remoteSha === sha)) continue
      try {
        const parsed = parseNote(base64ToUtf8(await this.gh.getBlob(sha)), path)
        // Emparejar por ruta; si no, por id (renombrado en otro dispositivo)... salvo que ese id
        // siga teniendo su propio archivo (copia manual con el mismo id → nota nueva).
        let local = atPath
        if (!local) {
          const sameId = byId.get(parsed.id)
          if (sameId && !(sameId.remotePath && sameId.remotePath !== path && remote.has(sameId.remotePath))) local = sameId
          else if (sameId) parsed.id = crypto.randomUUID()
        }
        if (local && local.syncStatus !== 'synced') continue

        const { hasId, ...fields } = parsed
        const id = local?.id ?? fields.id
        const applied = await this.db.transaction('rw', this.db.notes, async () => {
          const cur = await this.db.notes.get(id)
          // Se editó localmente mientras descargábamos: gana lo local.
          if (cur && (cur.syncStatus !== 'synced' || cur.rev !== local?.rev)) return false
          await this.db.notes.put({
            ...fields,
            id,
            remotePath: path,
            remoteSha: sha,
            // Archivos sin id en el frontmatter: se re-suben para fijarlo.
            syncStatus: hasId ? 'synced' : 'pending',
            rev: (cur?.rev ?? 0) + 1,
          })
          return true
        })
        if (applied) report.pulled++
      } catch (err) {
        this.handleItemError(err, report, path)
      }
    }

    // Notas sincronizadas cuyo archivo ya no existe en remoto → se borraron desde otro dispositivo.
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
  }

  /** Los errores por elemento no abortan el ciclo, salvo 401 (hay que parar y pedir login). */
  private handleItemError(err: unknown, report: SyncReport, item: string) {
    if (err instanceof Error && err.name === 'UnauthorizedError') throw err
    report.errors.push(`${item}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
