import { beforeEach, describe, expect, it } from 'vitest'
import { createDb, type FindegilDB, type Note } from '../db'
import { GitHubApiError, UnauthorizedError, type GitHubApi, type TreeEntry } from '../github/client'
import { base64ToBytes, base64ToUtf8, bytesToBase64, gitBlobSha, utf8ToBase64 } from '../lib/encoding'
import { serializeNote } from '../lib/frontmatter'
import { SyncEngine } from './engine'

/** Repo GitHub en memoria con la semántica de SHA de la Contents API. */
class FakeGitHub implements GitHubApi {
  files = new Map<string, { sha: string; b64: string }>()
  blobs = new Map<string, string>()
  commits: string[] = []
  unauthorized = false

  private check() {
    if (this.unauthorized) throw new UnauthorizedError()
  }

  async write(path: string, b64: string) {
    const sha = await gitBlobSha(base64ToBytes(b64))
    this.files.set(path, { sha, b64 })
    this.blobs.set(sha, b64)
    return sha
  }

  async getFileSha(path: string) {
    this.check()
    return this.files.get(path)?.sha ?? null
  }

  async putFile(path: string, b64: string, message: string, sha?: string) {
    this.check()
    const existing = this.files.get(path)
    if (existing && existing.sha !== sha) throw new GitHubApiError('sha mismatch', 409)
    if (!existing && sha) throw new GitHubApiError('not found', 404)
    this.commits.push(message)
    return this.write(path, b64)
  }

  async deleteFile(path: string, sha: string, message: string) {
    this.check()
    if (this.files.get(path)?.sha !== sha) throw new GitHubApiError('sha mismatch', 409)
    this.files.delete(path)
    this.commits.push(message)
  }

  async getTree(): Promise<TreeEntry[]> {
    this.check()
    return [...this.files].map(([path, f]) => ({ path, sha: f.sha, type: 'blob' as const }))
  }

  async getBlob(sha: string) {
    this.check()
    const b = this.blobs.get(sha)
    if (!b) throw new GitHubApiError('no blob', 404)
    return b
  }
}

let db: FindegilDB
let gh: FakeGitHub
let engine: SyncEngine
let n = 0

function makeNote(over: Partial<Note> = {}): Note {
  return {
    id: `note-${++n}`,
    title: 'Título',
    content: 'Cuerpo',
    tags: ['a'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    syncStatus: 'pending',
    remotePath: null,
    remoteSha: null,
    rev: 1,
    ...over,
  }
}

const text = (path: string) => base64ToUtf8(gh.files.get(path)!.b64)
const edit = (id: string, patch: Partial<Note>) =>
  db.notes.where('id').equals(id).modify((x) => Object.assign(x, patch, { syncStatus: 'pending', rev: x.rev + 1 }))

beforeEach(() => {
  db = createDb(`test-${Math.random()}`)
  gh = new FakeGitHub()
  engine = new SyncEngine(db, gh)
})

describe('SyncEngine push', () => {
  it('crea notes/<Título>.md con el id en el frontmatter', async () => {
    const note = makeNote({ title: 'Reunión de proyecto' })
    await db.notes.add(note)
    const report = await engine.run()

    expect(report.pushed).toBe(1)
    expect(text('notes/Reunión de proyecto.md')).toBe(serializeNote(note))
    expect(gh.commits).toEqual(['create: Reunión de proyecto'])
    expect(await db.notes.get(note.id)).toMatchObject({
      syncStatus: 'synced',
      remotePath: 'notes/Reunión de proyecto.md',
      remoteSha: gh.files.get('notes/Reunión de proyecto.md')!.sha,
    })
  })

  it('resuelve títulos repetidos con sufijo (n) y no los renombra después', async () => {
    const a = makeNote({ title: 'Idea' })
    const b = makeNote({ title: 'idea' })
    await db.notes.bulkAdd([a, b])
    await engine.run()
    expect([...gh.files.keys()].sort()).toEqual(['notes/Idea.md', 'notes/idea (2).md'])

    await edit(b.id, { content: 'otro cuerpo' })
    await engine.run()
    expect(gh.commits.at(-1)).toBe('update: idea')
    expect([...gh.files.keys()].sort()).toEqual(['notes/Idea.md', 'notes/idea (2).md'])
  })

  it('al cambiar el título mueve el archivo', async () => {
    const note = makeNote({ title: 'Borrador' })
    await db.notes.add(note)
    await engine.run()
    await edit(note.id, { title: 'Plan final' })
    await engine.run()
    expect([...gh.files.keys()]).toEqual(['notes/Plan final.md'])
    expect(gh.commits).toContain('rename: Borrador → Plan final')
    expect((await db.notes.get(note.id))!.remotePath).toBe('notes/Plan final.md')
  })

  it('en ediciones usa el SHA remoto actual (LWW sobre cambios remotos)', async () => {
    const note = makeNote()
    await db.notes.add(note)
    await engine.run()
    await gh.write('notes/Título.md', utf8ToBase64('remoto'))
    await edit(note.id, { content: 'local' })
    await engine.run()
    expect(text('notes/Título.md')).toContain('\nlocal\n')
    expect((await db.notes.get(note.id))!.content).toBe('local')
  })

  it('no crea commits si el contenido remoto ya es idéntico', async () => {
    const note = makeNote({ remotePath: 'notes/Título.md' })
    await gh.write('notes/Título.md', utf8ToBase64(serializeNote(note)))
    await db.notes.add(note)
    await engine.run()
    expect(gh.commits).toEqual([])
    expect((await db.notes.get(note.id))!.syncStatus).toBe('synced')
  })

  it('migra notas antiguas notes/<id>.md a su título', async () => {
    const note = makeNote({ title: 'Antigua', remotePath: null })
    await gh.write(`notes/${note.id}.md`, utf8ToBase64(serializeNote(note)))
    await db.notes.add({ ...note, remotePath: `notes/${note.id}.md` })
    await engine.run()
    expect([...gh.files.keys()]).toEqual(['notes/Antigua.md'])
  })

  it('borra en remoto y elimina el tombstone local', async () => {
    const note = makeNote()
    await db.notes.add(note)
    await engine.run()
    await db.notes.update(note.id, { syncStatus: 'deleted', rev: 2 })
    await engine.run()
    expect(gh.files.size).toBe(0)
    expect(await db.notes.get(note.id)).toBeUndefined()
    expect(gh.commits.at(-1)).toBe('delete: Título')
  })

  it('sube assets pendientes antes que las notas', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    await db.assets.add({
      path: 'assets/x.webp',
      blob: new Blob([bytes], { type: 'image/webp' }),
      mime: 'image/webp',
      syncStatus: 'pending',
      remoteSha: null,
      createdAt: '2026-01-01T00:00:00Z',
    })
    await db.notes.add(makeNote({ content: '![](../assets/x.webp)' }))
    await engine.run()
    expect(gh.commits[0]).toBe('asset: assets/x.webp')
    expect(gh.files.get('assets/x.webp')!.b64).toBe(bytesToBase64(bytes))
    expect((await db.assets.get('assets/x.webp'))!.syncStatus).toBe('synced')
  })
})

describe('SyncEngine pull', () => {
  it('descarga notas nuevas o modificadas en remoto', async () => {
    await gh.write('notes/Desde el móvil.md', utf8ToBase64('---\nid: r1\ntitle: Desde el móvil\ntags: [x]\n---\n\nHola'))
    await gh.write('README.md', utf8ToBase64('ignorado'))
    const report = await engine.run()
    expect(report.pulled).toBe(1)
    expect(await db.notes.get('r1')).toMatchObject({ title: 'Desde el móvil', content: 'Hola', tags: ['x'], syncStatus: 'synced' })
    expect(await db.notes.count()).toBe(1)

    await gh.write('notes/Desde el móvil.md', utf8ToBase64('---\nid: r1\ntitle: Editada\n---\nAdiós'))
    await engine.run()
    expect(await db.notes.get('r1')).toMatchObject({ title: 'Editada', content: 'Adiós' })
  })

  it('sigue la nota por id si se renombró en otro dispositivo', async () => {
    const note = makeNote({ title: 'Viejo' })
    await db.notes.add(note)
    await engine.run()
    const md = serializeNote({ ...note, title: 'Nuevo' })
    gh.files.delete('notes/Viejo.md')
    await gh.write('notes/Nuevo.md', utf8ToBase64(md))
    await engine.run()
    expect(await db.notes.count()).toBe(1)
    expect(await db.notes.get(note.id)).toMatchObject({ title: 'Nuevo', remotePath: 'notes/Nuevo.md' })
  })

  it('adopta archivos creados a mano sin frontmatter y les añade id', async () => {
    await gh.write('notes/Apuntes sueltos.md', utf8ToBase64('texto libre'))
    await engine.run()
    const [note] = await db.notes.toArray()
    expect(note).toMatchObject({ title: 'Apuntes sueltos', remotePath: 'notes/Apuntes sueltos.md', syncStatus: 'pending' })
    await engine.run()
    expect(text('notes/Apuntes sueltos.md')).toContain(`id: ${note.id}`)
    expect(gh.files.size).toBe(1)
  })

  it('no sobrescribe notas con cambios locales pendientes', async () => {
    const note = makeNote()
    await db.notes.add(note)
    await engine.run()
    await gh.write('notes/Título.md', utf8ToBase64('remoto'))
    await edit(note.id, { content: 'local pendiente' })
    const put = gh.putFile.bind(gh)
    gh.putFile = async () => {
      throw new GitHubApiError('network', 0)
    }
    const report = await engine.run()
    gh.putFile = put
    expect(report.errors).toHaveLength(1)
    expect((await db.notes.get(note.id))!).toMatchObject({ content: 'local pendiente', syncStatus: 'pending' })
  })

  it('elimina localmente las notas borradas en remoto', async () => {
    const note = makeNote()
    await db.notes.add(note)
    await engine.run()
    gh.files.delete('notes/Título.md')
    const report = await engine.run()
    expect(report.deletedLocal).toBe(1)
    expect(await db.notes.get(note.id)).toBeUndefined()
  })

  it('propaga el 401 para que la app pida login de nuevo', async () => {
    await db.notes.add(makeNote())
    gh.unauthorized = true
    await expect(engine.run()).rejects.toBeInstanceOf(UnauthorizedError)
  })
})
