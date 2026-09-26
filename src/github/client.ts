import { Octokit } from '@octokit/rest'

export interface Credentials {
  token: string
  owner: string
  repo: string
  /** Rama por defecto del repo de notas (se resuelve en el login). */
  branch: string
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Token de GitHub inválido o revocado (401)')
    this.name = 'UnauthorizedError'
  }
}

export class GitHubApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'GitHubApiError'
    this.status = status
  }
}

export interface TreeEntry {
  path: string
  sha: string
  type: 'blob' | 'tree' | 'commit'
}

export interface RepoInfo {
  defaultBranch: string
  isPrivate: boolean
  canPush: boolean
  fullName: string
}

export interface RepoHead {
  commitSha: string
  treeSha: string
}

/** Cambio de un archivo dentro de un commit: contenido de texto, blob ya subido o borrado. */
export type TreeChange =
  | { path: string; content: string }
  | { path: string; blobSha: string }
  | { path: string; delete: true }

/** Superficie mínima de la API que usa el motor de sync (facilita los tests). */
export interface GitHubApi {
  /** Commit y árbol actuales de la rama; null si el repo está vacío. */
  getHead(): Promise<RepoHead | null>
  getTree(treeSha: string): Promise<TreeEntry[]>
  /** Contenido base64 de un blob. */
  getBlob(sha: string): Promise<string>
  /** Sube un blob binario (base64) y devuelve su SHA. */
  createBlob(base64: string): Promise<string>
  /** Crea un único commit con todos los cambios sobre `head` y mueve la rama (falla si la rama avanzó). */
  commit(head: RepoHead | null, changes: TreeChange[], message: string): Promise<RepoHead>
}

/** La rama avanzó entre la lectura y el commit (otro dispositivo sincronizó a la vez). */
export class ConflictError extends Error {
  constructor() {
    super('La rama cambió durante la sincronización')
    this.name = 'ConflictError'
  }
}

function statusOf(err: unknown): number | undefined {
  return typeof err === 'object' && err && 'status' in err ? Number((err as { status: unknown }).status) : undefined
}

function wrap(err: unknown): never {
  const status = statusOf(err)
  if (status === 401) throw new UnauthorizedError()
  const message = err instanceof Error ? err.message : String(err)
  throw new GitHubApiError(message, status ?? 0)
}

export function isStatus(err: unknown, ...codes: number[]): boolean {
  const s = err instanceof GitHubApiError ? err.status : statusOf(err)
  return s !== undefined && codes.includes(s)
}

/** Octokit con fetch sin caché HTTP: la API envía max-age=60 y un SHA cacheado provocaría 409 en el PUT. */
function createOctokit(token: string) {
  return new Octokit({
    auth: token,
    request: { fetch: (url: RequestInfo | URL, init?: RequestInit) => fetch(url, { ...init, cache: 'no-store' }) },
  })
}

export async function fetchRepoInfo(token: string, owner: string, repo: string): Promise<RepoInfo> {
  try {
    const { data } = await createOctokit(token).repos.get({ owner, repo })
    return {
      defaultBranch: data.default_branch || 'main',
      isPrivate: data.private,
      canPush: Boolean(data.permissions?.push),
      fullName: data.full_name,
    }
  } catch (err) {
    wrap(err)
  }
}

export class GitHubClient implements GitHubApi {
  private octokit: Octokit
  private creds: Credentials

  constructor(creds: Credentials) {
    this.creds = creds
    this.octokit = createOctokit(creds.token)
  }

  private get base() {
    return { owner: this.creds.owner, repo: this.creds.repo }
  }

  async getHead(): Promise<RepoHead | null> {
    try {
      const { data: ref } = await this.octokit.git.getRef({ ...this.base, ref: `heads/${this.creds.branch}` })
      const { data: commit } = await this.octokit.git.getCommit({ ...this.base, commit_sha: ref.object.sha })
      return { commitSha: commit.sha, treeSha: commit.tree.sha }
    } catch (err) {
      // 404: la rama no existe; 409: repositorio vacío.
      if (isStatus(err, 404, 409)) return null
      wrap(err)
    }
  }

  async getTree(treeSha: string): Promise<TreeEntry[]> {
    try {
      const { data } = await this.octokit.git.getTree({ ...this.base, tree_sha: treeSha, recursive: 'true' })
      if (data.truncated) console.warn('[findegil] Árbol remoto truncado: algunas notas pueden no descargarse')
      return data.tree
        .filter((e) => e.path && e.sha)
        .map((e) => ({ path: e.path!, sha: e.sha!, type: e.type as TreeEntry['type'] }))
    } catch (err) {
      wrap(err)
    }
  }

  async getBlob(sha: string): Promise<string> {
    try {
      const { data } = await this.octokit.git.getBlob({ ...this.base, file_sha: sha })
      return data.content
    } catch (err) {
      wrap(err)
    }
  }

  async createBlob(base64: string): Promise<string> {
    await this.ensureInitialized()
    try {
      const { data } = await this.octokit.git.createBlob({ ...this.base, content: base64, encoding: 'base64' })
      return data.sha
    } catch (err) {
      wrap(err)
    }
  }

  /** La Git Data API no funciona en repos vacíos: se crea el primer commit con la Contents API. */
  private async ensureInitialized(): Promise<RepoHead> {
    const head = await this.getHead()
    if (head) return head
    try {
      const readme = btoa('# Notas de Findegil\n\nRepositorio gestionado por la app Findegil (método PARA).\n')
      await this.octokit.repos.createOrUpdateFileContents({ ...this.base, path: 'README.md', message: 'init', content: readme, branch: this.creds.branch })
    } catch (err) {
      if (!isStatus(err, 422)) wrap(err)
    }
    const created = await this.getHead()
    if (!created) throw new GitHubApiError('No se pudo inicializar el repositorio', 500)
    return created
  }

  async commit(head: RepoHead | null, changes: TreeChange[], message: string): Promise<RepoHead> {
    const base = head ?? (await this.ensureInitialized())
    try {
      const tree = changes.map((c) => {
        const entry = { path: c.path, mode: '100644' as const, type: 'blob' as const }
        if ('delete' in c) return { ...entry, sha: null }
        if ('blobSha' in c) return { ...entry, sha: c.blobSha }
        return { ...entry, content: c.content }
      })
      const { data: newTree } = await this.octokit.git.createTree({ ...this.base, base_tree: base.treeSha, tree })
      const { data: commit } = await this.octokit.git.createCommit({
        ...this.base,
        message,
        tree: newTree.sha,
        parents: [base.commitSha],
      })
      try {
        await this.octokit.git.updateRef({ ...this.base, ref: `heads/${this.creds.branch}`, sha: commit.sha, force: false })
      } catch (err) {
        if (isStatus(err, 409, 422)) throw new ConflictError()
        throw err
      }
      return { commitSha: commit.sha, treeSha: newTree.sha }
    } catch (err) {
      if (err instanceof ConflictError) throw err
      wrap(err)
    }
  }

  /** SHA de un archivo por ruta (Contents API); null si no existe. Lo usa la carga bajo demanda de imágenes. */
  async getFileSha(path: string): Promise<string | null> {
    try {
      const { data } = await this.octokit.repos.getContent({ ...this.base, path, ref: this.creds.branch })
      if (Array.isArray(data)) return null
      return data.sha
    } catch (err) {
      if (isStatus(err, 404)) return null
      wrap(err)
    }
  }
}
