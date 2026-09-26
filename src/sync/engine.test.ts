import { beforeEach, describe, expect, it } from 'vitest'
import { createDb, type Container, type FindegilDB, type Note } from '../db'
import {
  ConflictError,
  GitHubApiError,
  UnauthorizedError,
  type GitHubApi,
  type RepoHead,
  type TreeChange,
  type TreeEntry,
} from '../github/client'
import { base64ToBytes, base64ToUtf8, bytesToBase64, gitBlobSha, utf8ToBase64 } from '../lib/encoding'
import { serializeNote } from '../lib/frontmatter'
import { SyncEngine } from './engine'

/** Repo GitHub en memoria con semántica de commits de la Git Data API. */
class FakeGitHub implements GitHubApi {
  files = new Map<string, { sha: string; b64: string }>()
  blobs = new Map<string, string>()
  commits: { message: string; changes: TreeChange[] }[] = []
  head: RepoHead | null = null
  unauthorized = false
  /** Simula que otro dispositivo hace push justo antes de nuestro commit. */
  raceOnce = false
  private n = 0

  private check() {
    if (this.unauthorized) throw new UnauthorizedError()
  }

  private bump() {
    this.n++
    this.head = { commitSha: `c${this.n}`, treeSha: `t${this.n}` }
  }

  /** Escribe directamente en el "remoto" (como otro dispositivo o una edición en github.com). */
  async write(path: string, text: string) {
    const b64 = utf8ToBase64(text)
    const sha = await gitBlobSha(base64ToBytes(b64))
    this.files.set(path, { sha, b64 })
    this.blobs.set(sha, b64)
    this.bump()
  }

  remove(path: string) {
    this.files.delete(path)
    this.bump()
  }

  text(path: string) {
    const f = this.files.get(path)
    return f ? base64ToUtf8(f.b64) : undefined
  }

  paths() {
    return [...this.files.keys()].sort()
  }

  async getHead() {
    this.check()
    return this.head
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

  async createBlob(b64: string) {
    this.check()
    const sha = await gitBlobSha(base64ToBytes(b64))
    this.blobs.set(sha, b64)
    return sha
  }

  async commit(head: RepoHead | null, changes: TreeChange[], message: string): Promise<RepoHead> {
    this.check()
    if (this.raceOnce) {
      this.raceOnce = false
      await this.write('00 Landing Zone/De otro dispositivo.md', '---\nid: other\ntitle: De otro dispositivo\n---\nhola')
    }
    if ((head?.commitSha ?? null) !== (this.head?.commitSha ?? null)) throw new ConflictError()
    for (const c of changes) {
      if ('delete' in c) {
        if (!this.files.has(c.path)) throw new GitHubApiError(`delete de ruta inexistente: ${c.path}`, 422)
        this.files.delete(c.path)
      } else if ('blobSha' in c) {
        this.files.set(c.path, { sha: c.blobSha, b64: this.blobs.get(c.blobSha)! })
      } else {
        const b64 = utf8ToBase64(c.content)
        const sha = await gitBlobSha(base64ToBytes(b64))
        this.blobs.set(sha, b64)
        this.files.set(c.path, { sha, b64 })
      }
    }
    this.commits.push({ message, changes })
    this.bump()
    return this.head!
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
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    bucket: 'inbox',
    containerId: null,
    due: null,
    remind: null,
    done: false,
    syncStatus: 'pending',
    remotePath: null,
    remoteSha: null,
    rev: 1,
    ...over,
  }
}

function makeContainer(over: Partial<Container> = {}): Container {
  return {
    id: `c-${++n}`,
    kind: 'project',
    name: 'Web',
    status: 'active',
    deadline: null,
    description: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    syncStatus: 'pending',
    remotePath: null,
    remoteSha: null,
    rev: 1,
    ...over,
  }
}

const edit = <T extends { rev: number; syncStatus: string }>(table: 'notes' | 'containers', id: string, patch: Partial<T>) =>
  (db[table] as unknown as { where(k: string): { equals(v: string): { modify(f: (x: T) => void): Promise<number> } } })
    .where('id')
    .equals(id)
    .modify((x) => Object.assign(x, patch, { syncStatus: 'pending', rev: x.rev + 1 }))

beforeEach(() => {
  db = createDb(`test-${Math.random()}`)
  gh = new FakeGitHub()
  engine = new SyncEngine(db, gh)
})

describe('push', () => {
  it('guarda las capturas en 00 Landing Zone con un único commit', async () => {
    const a = makeNote({ title: 'Llamar al banco', due: '2026-10-01T17:00:00Z', remind: '2026-10-01T16:45:00Z' })
    const b = makeNote({ title: 'Idea' })
    await db.notes.bulkAdd([a, b])
    const report = await engine.run()

    expect(report.pushed).toBe(2)
    expect(gh.commits).toHaveLength(1)
    expect(gh.paths()).toEqual(['00 Landing Zone/Idea.md', '00 Landing Zone/Llamar al banco.md'])
    const md = gh.text('00 Landing Zone/Llamar al banco.md')!
    expect(md).toContain('due: 2026-10-01T17:00:00Z')
    expect(md).toContain('remind: 2026-10-01T16:45:00Z')
    expect(await db.notes.get(a.id)).toMatchObject({ syncStatus: 'synced', remotePath: '00 Landing Zone/Llamar al banco.md' })
  })

  it('clasificar en un proyecto mueve la nota y crea _project.md en el mismo commit', async () => {
    const note = makeNote({ title: 'Hotel' })
    await db.notes.add(note)
    await engine.run()

    const project = makeContainer({ name: 'Viaje a Lisboa', deadline: '2026-11-02' })
    await db.containers.add(project)
    await edit<Note>('notes', note.id, { bucket: 'container', containerId: project.id })
    await engine.run()

    expect(gh.commits).toHaveLength(2)
    expect(gh.paths()).toEqual(['01 Projects/Viaje a Lisboa/Hotel.md', '01 Projects/Viaje a Lisboa/_project.md'])
    expect(gh.text('01 Projects/Viaje a Lisboa/_project.md')).toContain('deadline: 2026-11-02')
    expect(await db.containers.get(project.id)).toMatchObject({ remotePath: '01 Projects/Viaje a Lisboa', syncStatus: 'synced' })
  })

  it('archivar un proyecto mueve toda su carpeta a 04 Archive en un commit', async () => {
    const project = makeContainer({ name: 'Web' })
    await db.containers.add(project)
    await db.notes.bulkAdd([
      makeNote({ title: 'A', bucket: 'container', containerId: project.id }),
      makeNote({ title: 'B', bucket: 'container', containerId: project.id }),
    ])
    await engine.run()
    await edit<Container>('containers', project.id, { status: 'archived' })
    await engine.run()

    expect(gh.commits).toHaveLength(2)
    expect(gh.paths()).toEqual(['04 Archive/Projects/Web/A.md', '04 Archive/Projects/Web/B.md', '04 Archive/Projects/Web/_project.md'])
    expect((await db.notes.toArray()).every((x) => x.syncStatus === 'synced')).toBe(true)
  })

  it('áreas, recursos y scratch van a su carpeta', async () => {
    const area = makeContainer({ kind: 'area', name: 'Salud' })
    const res = makeContainer({ kind: 'resource', name: 'Tolkien' })
    await db.containers.bulkAdd([area, res])
    await db.notes.bulkAdd([
      makeNote({ title: 'Analítica', bucket: 'container', containerId: area.id }),
      makeNote({ title: 'Silmarillion', bucket: 'container', containerId: res.id }),
      makeNote({ title: 'Compra', bucket: 'scratch' }),
    ])
    await engine.run()
    expect(gh.paths()).toEqual([
      '02 Areas/Salud/Analítica.md',
      '02 Areas/Salud/_area.md',
      '03 Resources/Tolkien/Silmarillion.md',
      '03 Resources/Tolkien/_resource.md',
      'Scratch/Compra.md',
    ])
  })

  it('renombrar el título mueve el archivo; títulos repetidos llevan sufijo', async () => {
    const a = makeNote({ title: 'Idea' })
    const b = makeNote({ title: 'idea' })
    await db.notes.bulkAdd([a, b])
    await engine.run()
    expect(gh.paths()).toEqual(['00 Landing Zone/Idea.md', '00 Landing Zone/idea (2).md'])

    await edit<Note>('notes', a.id, { title: 'Plan' })
    await engine.run()
    expect(gh.paths()).toEqual(['00 Landing Zone/Plan.md', '00 Landing Zone/idea (2).md'])
    expect(gh.commits.at(-1)!.message).toContain('move: Plan')
  })

  it('no crea commits si no hay cambios reales', async () => {
    const note = makeNote({ remotePath: '00 Landing Zone/Título.md' })
    await gh.write('00 Landing Zone/Título.md', serializeNote(note))
    await db.notes.add(note)
    await engine.run()
    expect(gh.commits).toHaveLength(0)
    expect((await db.notes.get(note.id))!.syncStatus).toBe('synced')
  })

  it('migra notas antiguas de notes/ a la Landing Zone', async () => {
    const note = makeNote({ title: 'Vieja', remotePath: 'notes/Vieja.md' })
    await gh.write('notes/Vieja.md', serializeNote(note))
    await db.notes.add(note)
    await engine.run()
    expect(gh.paths()).toEqual(['00 Landing Zone/Vieja.md'])
  })

  it('borra en remoto y elimina el tombstone local', async () => {
    const note = makeNote()
    await db.notes.add(note)
    await engine.run()
    await db.notes.update(note.id, { syncStatus: 'deleted', rev: 2 })
    await engine.run()
    expect(gh.paths()).toEqual([])
    expect(await db.notes.get(note.id)).toBeUndefined()
    expect(gh.commits.at(-1)!.message).toBe('delete: Título')
  })

  it('sube las imágenes como blobs en el mismo commit', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    await db.assets.add({
      path: 'assets/x.webp',
      blob: new Blob([bytes], { type: 'image/webp' }),
      mime: 'image/webp',
      syncStatus: 'pending',
      remoteSha: null,
      createdAt: '2026-01-01T00:00:00Z',
    })
    await db.notes.add(makeNote({ content: '![](/assets/x.webp)' }))
    await engine.run()
    expect(gh.commits).toHaveLength(1)
    expect(gh.files.get('assets/x.webp')!.b64).toBe(bytesToBase64(bytes))
    expect((await db.assets.get('assets/x.webp'))!.syncStatus).toBe('synced')
  })

  it('si otro dispositivo hizo push a la vez, reintenta sobre la rama nueva', async () => {
    await gh.write('README.md', 'x')
    await db.notes.add(makeNote({ title: 'Mía' }))
    gh.raceOnce = true
    await engine.run()
    expect(gh.paths()).toEqual(['00 Landing Zone/De otro dispositivo.md', '00 Landing Zone/Mía.md', 'README.md'])
    expect(await db.notes.get('other')).toMatchObject({ bucket: 'inbox', syncStatus: 'synced' })
  })
})

describe('pull', () => {
  it('reconstruye proyectos, áreas y la ubicación de cada nota desde las carpetas', async () => {
    await gh.write('01 Projects/Web/_project.md', '---\nid: p1\ntype: project\nname: Web\ndeadline: 2026-10-15\n---\n\nRediseño')
    await gh.write('01 Projects/Web/Idea.md', '---\nid: n1\ntitle: Idea\n---\nuna idea')
    await gh.write('04 Archive/Areas/Coche/_area.md', '---\nid: a1\ntype: area\nname: Coche\n---\n')
    await gh.write('Scratch/Compra.md', '---\nid: s1\ntitle: Compra\n---\n- pan')
    await gh.write('00 Landing Zone/Captura.md', '---\nid: i1\ntitle: Captura\ndue: 2026-10-01\n---\nx')
    await gh.write('README.md', 'ignorado')
    await engine.run()

    expect(await db.containers.get('p1')).toMatchObject({ kind: 'project', name: 'Web', status: 'active', deadline: '2026-10-15', description: 'Rediseño' })
    expect(await db.containers.get('a1')).toMatchObject({ kind: 'area', status: 'archived' })
    expect(await db.notes.get('n1')).toMatchObject({ bucket: 'container', containerId: 'p1', syncStatus: 'synced' })
    expect(await db.notes.get('s1')).toMatchObject({ bucket: 'scratch' })
    expect(await db.notes.get('i1')).toMatchObject({ bucket: 'inbox', due: '2026-10-01' })
    expect(await db.notes.count()).toBe(3)
  })

  it('crea el contenedor si hay una carpeta sin _meta y adopta archivos sin frontmatter', async () => {
    await gh.write('03 Resources/Recetas/Pan.md', 'harina y agua')
    await engine.run()
    const [c] = await db.containers.toArray()
    expect(c).toMatchObject({ kind: 'resource', name: 'Recetas' })
    await engine.run()
    expect(gh.paths()).toEqual(['03 Resources/Recetas/Pan.md', '03 Resources/Recetas/_resource.md'])
    const note = (await db.notes.toArray())[0]
    expect(gh.text('03 Resources/Recetas/Pan.md')).toContain(`id: ${note.id}`)
    expect(note).toMatchObject({ bucket: 'container', containerId: c.id, title: 'Pan' })
  })

  it('una nota movida de carpeta en otro dispositivo cambia de ubicación', async () => {
    const note = makeNote({ title: 'Nota' })
    await db.notes.add(note)
    await engine.run()
    const md = gh.text('00 Landing Zone/Nota.md')!
    gh.remove('00 Landing Zone/Nota.md')
    await gh.write('Scratch/Nota.md', md)
    await engine.run()
    expect(await db.notes.count()).toBe(1)
    expect(await db.notes.get(note.id)).toMatchObject({ bucket: 'scratch', remotePath: 'Scratch/Nota.md' })
  })

  it('no sobrescribe notas con cambios locales pendientes', async () => {
    const note = makeNote()
    await db.notes.add(note)
    await engine.run()
    await gh.write('00 Landing Zone/Título.md', '---\nid: ' + note.id + '\ntitle: Título\n---\nremoto')
    await edit<Note>('notes', note.id, { content: 'local' })
    await engine.run()
    expect((await db.notes.get(note.id))!.content).toBe('local')
    expect(gh.text('00 Landing Zone/Título.md')).toContain('\nlocal\n')
  })

  it('elimina localmente las notas borradas en remoto', async () => {
    const note = makeNote()
    await db.notes.add(note)
    await engine.run()
    gh.remove('00 Landing Zone/Título.md')
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
