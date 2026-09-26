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

/** Superficie mínima de la API que usa el motor de sync (facilita los tests). */
export interface GitHubApi {
  getFileSha(path: string): Promise<string | null>
  putFile(path: string, base64: string, message: string, sha?: string): Promise<string>
  deleteFile(path: string, sha: string, message: string): Promise<void>
  getTree(): Promise<TreeEntry[]>
  getBlob(sha: string): Promise<string>
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

  async getFileSha(path: string): Promise<string | null> {
    try {
      const { data } = await this.octokit.repos.getContent({ ...this.base, path, ref: this.creds.branch })
      if (Array.isArray(data)) throw new GitHubApiError(`${path} es un directorio`, 422)
      return data.sha
    } catch (err) {
      if (isStatus(err, 404)) return null
      if (err instanceof GitHubApiError) throw err
      wrap(err)
    }
  }

  async putFile(path: string, base64: string, message: string, sha?: string): Promise<string> {
    try {
      const { data } = await this.octokit.repos.createOrUpdateFileContents({
        ...this.base,
        path,
        message,
        content: base64,
        sha,
        branch: this.creds.branch,
      })
      if (!data.content?.sha) throw new GitHubApiError('Respuesta sin SHA', 500)
      return data.content.sha
    } catch (err) {
      if (err instanceof GitHubApiError) throw err
      wrap(err)
    }
  }

  async deleteFile(path: string, sha: string, message: string): Promise<void> {
    try {
      await this.octokit.repos.deleteFile({ ...this.base, path, sha, message, branch: this.creds.branch })
    } catch (err) {
      wrap(err)
    }
  }

  async getTree(): Promise<TreeEntry[]> {
    try {
      const { data } = await this.octokit.git.getTree({ ...this.base, tree_sha: this.creds.branch, recursive: 'true' })
      if (data.truncated) console.warn('[findegil] Árbol remoto truncado: algunas notas pueden no descargarse')
      return data.tree
        .filter((e) => e.path && e.sha)
        .map((e) => ({ path: e.path!, sha: e.sha!, type: e.type as TreeEntry['type'] }))
    } catch (err) {
      // 409: repositorio vacío; 404: la rama aún no existe.
      if (isStatus(err, 404, 409)) return []
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
}
