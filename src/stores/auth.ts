import { ref } from 'vue'
import { userConfig, normEmail } from '../config/users'
import { db, delKV, getKV, setKV } from '../db'
import type { Credentials } from '../github/client'
import { decodeIdToken, googleSignOut, validClaims } from '../lib/google'

export interface Session {
  email: string
  name?: string
  picture?: string
}

/** Identidad (Google). Se cachea en IndexedDB para arrancar offline. */
export const session = ref<Session | null>(null)
/** Acceso a datos (GitHub). El repo sale de la configuración del usuario, nunca de la UI. */
export const credentials = ref<Credentials | null>(null)

export async function loadAuth() {
  const s = await getKV<Session>('session')
  const cfg = userConfig(s?.email)
  if (!s || !cfg) {
    await Promise.all([delKV('session'), delKV('credentials')])
    return
  }
  session.value = s
  const c = await getKV<Credentials>('credentials')
  credentials.value = c && c.owner === cfg.owner && c.repo === cfg.repo ? c : null
}

/** Procesa el ID token de Google: solo entran los correos configurados en config/users.ts. */
export async function signInWithGoogle(idToken: string): Promise<void> {
  const claims = decodeIdToken(idToken)
  if (!validClaims(claims)) throw new Error('No se pudo verificar la cuenta de Google. Inténtalo de nuevo.')
  const email = normEmail(claims.email)
  if (!userConfig(email)) {
    googleSignOut()
    throw new Error(`La cuenta ${email} no tiene acceso a Findegil.`)
  }

  // Si cambia el usuario del dispositivo, los datos locales son de otro repo: se descartan.
  const previous = await getKV<string>('owner')
  if (previous && previous !== email) {
    await Promise.all([db.notes.clear(), db.assets.clear(), delKV('lastSyncAt'), delKV('credentials')])
    credentials.value = null
  }
  const s: Session = { email, name: claims.name, picture: claims.picture }
  await setKV('session', s)
  await setKV('owner', email)
  session.value = s
}

/** Valida el token de GitHub contra el repo del usuario y lo guarda en este dispositivo. */
export async function setGitHubToken(token: string): Promise<void> {
  const cfg = userConfig(session.value?.email)
  if (!cfg) throw new Error('Sesión no válida.')
  // Octokit se carga bajo demanda para no engordar el arranque de la app.
  const { fetchRepoInfo, UnauthorizedError } = await import('../github/client')
  let info
  try {
    info = await fetchRepoInfo(token.trim(), cfg.owner, cfg.repo)
  } catch (err) {
    if (err instanceof UnauthorizedError) throw new Error('Token inválido o caducado.')
    throw new Error('El token no tiene acceso al repositorio de notas.')
  }
  if (!info.canPush) throw new Error('El token no tiene permisos de escritura (Contents: Read and write).')
  if (!info.isPrivate) throw new Error('El repositorio de notas debe ser privado.')

  const creds: Credentials = { token: token.trim(), owner: cfg.owner, repo: cfg.repo, branch: info.defaultBranch }
  await setKV('credentials', creds)
  credentials.value = creds
}

/** 401 de GitHub: se borra el token local (la sesión de Google y las notas se conservan). */
export async function forgetGitHubToken(): Promise<void> {
  await delKV('credentials')
  credentials.value = null
}

/** Cerrar sesión: borra identidad y token. Las notas locales se conservan para el mismo usuario. */
export async function signOut(): Promise<void> {
  googleSignOut()
  await Promise.all([delKV('session'), delKV('credentials')])
  session.value = null
  credentials.value = null
}
