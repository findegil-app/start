import type { FindegilDB, Note } from '../db'
import { isStatus, type GitHubApi } from '../github/client'
import { base64ToUtf8, bytesToBase64, gitBlobSha, utf8Bytes } from '../lib/encoding'
import { parseNote, serializeNote } from '../lib/frontmatter'
import { noteIdFromPath, notePath } from '../lib/paths'

export interface SyncReport {
  pushed: number
  deletedRemote: number
  pulled: number
  deletedLocal: number
  assetsPushed: number
  errors: string[]
}

/**
 * Motor de sincronización local ⇄ GitHub.
 *
 * - Push: notas/assets con sync_status pendiente → PUT/DELETE en la Contents API (GET previo del SHA).
 * - Pull: árbol recursivo de la rama → descarga los blobs cuyo SHA cambió.
 * - Conflictos: Last-Write-Wins a favor del cambio local (las notas pendientes nunca se sobrescriben en el pull).
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
    for (const note of pending) {
      try {
        if (note.syncStatus === 'deleted') {
          await this.pushDelete(note)
          report.deletedRemote++
        } else {
          await this.pushUpsert(note)
          report.pushed++
        }
      } catch (err) {
        this.handleItemError(err, report, note.id)
      }
    }
  }

  private async pushUpsert(note: Note, retry = true): Promise<void> {
    const path = notePath(note.id)
    const bytes = utf8Bytes(serializeNote(note))
    const localSha = await gitBlobSha(bytes)
    // GET previo del SHA remoto (necesario para editar; LWW: sobrescribimos lo que haya).
    const remoteSha = await this.gh.getFileSha(path)
    let newSha: string
    if (remoteSha === localSha) {
      newSha = remoteSha
    } else {
      try {
        const verb = remoteSha ? 'update' : 'create'
        newSha = await this.gh.putFile(path, bytesToBase64(bytes), `${verb}: ${note.id}`, remoteSha ?? undefined)
      } catch (err) {
        // 409/422: el SHA cambió entre el GET y el PUT → reintentar una vez con SHA fresco.
        if (retry && isStatus(err, 409, 422)) return this.pushUpsert(note, false)
        throw err
      }
    }
    await this.db.transaction('rw', this.db.notes, async () => {
      const current = await this.db.notes.get(note.id)
      if (!current) return
      // Si el usuario editó durante la subida, sigue pendiente pero con el SHA remoto actualizado.
      const unchanged = current.rev === note.rev
      await this.db.notes.update(note.id, unchanged ? { syncStatus: 'synced', remoteSha: newSha } : { remoteSha: newSha })
    })
  }

  private async pushDelete(note: Note): Promise<void> {
    const path = notePath(note.id)
    const remoteSha = await this.gh.getFileSha(path)
    if (remoteSha) {
      try {
        await this.gh.deleteFile(path, remoteSha, `delete: ${note.id}`)
      } catch (err) {
        if (!isStatus(err, 404)) throw err
      }
    }
    await this.db.transaction('rw', this.db.notes, async () => {
      const current = await this.db.notes.get(note.id)
      if (current && current.rev === note.rev) await this.db.notes.delete(note.id)
    })
  }

  private async pull(report: SyncReport) {
    const tree = await this.gh.getTree()
    const remote = new Map<string, string>()
    for (const entry of tree) {
      if (entry.type !== 'blob') continue
      const id = noteIdFromPath(entry.path)
      if (id) remote.set(id, entry.sha)
    }

    for (const [id, sha] of remote) {
      const local = await this.db.notes.get(id)
      if (local && (local.syncStatus !== 'synced' || local.remoteSha === sha)) continue
      try {
        const parsed = parseNote(id, base64ToUtf8(await this.gh.getBlob(sha)))
        await this.db.transaction('rw', this.db.notes, async () => {
          const current = await this.db.notes.get(id)
          // Se editó localmente mientras descargábamos: gana lo local.
          if (current && (current.syncStatus !== 'synced' || current.rev !== local?.rev)) return
          await this.db.notes.put({
            ...parsed,
            syncStatus: 'synced',
            remoteSha: sha,
            rev: (current?.rev ?? 0) + 1,
          })
        })
        report.pulled++
      } catch (err) {
        this.handleItemError(err, report, id)
      }
    }

    // Notas sincronizadas que ya no existen en remoto → se borraron desde otro dispositivo.
    const synced = await this.db.notes.where('syncStatus').equals('synced').toArray()
    for (const note of synced) {
      if (!note.remoteSha || remote.has(note.id)) continue
      await this.db.transaction('rw', this.db.notes, async () => {
        const current = await this.db.notes.get(note.id)
        if (current && current.syncStatus === 'synced' && current.rev === note.rev) {
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
