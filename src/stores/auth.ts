import { ref } from 'vue'
import { db, delKV, getKV, setKV } from '../db'
import type { Credentials } from '../github/client'

export const DEFAULT_REPO = 'pablolloce/red-notes'

export const credentials = ref<Credentials | null>(null)

export async function loadCredentials() {
  credentials.value = (await getKV<Credentials>('credentials')) ?? null
  return credentials.value
}

export async function login(token: string, fullRepo: string): Promise<void> {
  const [owner, repo] = fullRepo.trim().split('/')
  if (!owner || !repo) throw new Error('Formato de repositorio inválido. Usa owner/repo.')

  // Octokit se carga bajo demanda para no engordar el arranque de la app.
  const { fetchRepoInfo, UnauthorizedError } = await import('../github/client')
  let info
  try {
    info = await fetchRepoInfo(token.trim(), owner, repo)
  } catch (err) {
    if (err instanceof UnauthorizedError) throw new Error('Token inválido o caducado.')
    throw new Error('No se pudo acceder al repositorio. Revisa que el token tenga acceso a él.')
  }
  if (!info.canPush) throw new Error('El token no tiene permisos de escritura (Contents: Read and write).')
  if (!info.isPrivate) throw new Error('El repositorio de notas debe ser privado.')

  // Si cambia el repo de destino, los datos locales pertenecen a otro repo: se descartan.
  const previous = await getKV<string>('repo')
  if (previous && previous !== info.fullName) {
    await Promise.all([db.notes.clear(), db.assets.clear(), delKV('lastSyncAt')])
  }

  const creds: Credentials = { token: token.trim(), owner, repo, branch: info.defaultBranch }
  await setKV('credentials', creds)
  await setKV('repo', info.fullName)
  credentials.value = creds
}

/** Borra el token local (p. ej. tras un 401). Las notas locales se conservan. */
export async function logout(): Promise<void> {
  await delKV('credentials')
  credentials.value = null
}
