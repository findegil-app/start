import { ref } from 'vue'
import { userConfig, normEmail } from '../config/users'
import { db, delKV, getKV, setKV } from '../db'
import type { Credentials } from '../github/client'
import { decodeIdToken, googleSignOut, validClaims } from '../lib/google'
import { openToken } from '../lib/vault'

export interface Session {
  email: string
  /** Id interno de la cuenta de Google: es la llave del token cifrado del bundle. */
  sub: string
  name?: string
  picture?: string
}

export type UnlockErrorCode = 'missing' | 'mismatch' | 'expired' | 'no-access'

/** Fallo al abrir el acceso al repo con el token embebido. */
export class UnlockError extends Error {
  readonly code: UnlockErrorCode

  constructor(code: UnlockErrorCode, message: string) {
    super(message)
    this.name = 'UnlockError'
    this.code = code
  }
}

/** Identidad (Google). Se cachea en IndexedDB para arrancar offline. */
export const session = ref<Session | null>(null)
/** Acceso a datos (GitHub). El repo sale de la configuración del usuario, nunca de la UI. */
export const credentials = ref<Credentials | null>(null)

export async function loadAuth() {
  const s = await getKV<Session>('session')
  const cfg = userConfig(s?.email)
  if (!s?.sub || !cfg) {
    await Promise.all([delKV('session'), delKV('credentials')])
    return
  }
  session.value = s
  const c = await getKV<Credentials>('credentials')
  credentials.value = c && c.owner === cfg.owner && c.repo === cfg.repo ? c : null
}

/** Procesa el ID token de Google: solo entran los correos de config/users.ts. Después abre el repo. */
export async function signInWithGoogle(idToken: string): Promise<void> {
  const claims = decodeIdToken(idToken)
  if (!validClaims(claims) || !claims.sub) throw new Error('Could not verify the Google account. Please try again.')
  const email = normEmail(claims.email)
  if (!userConfig(email)) {
    googleSignOut()
    throw new Error(`The account ${email} has no access to Findegil.`)
  }

  // Si cambia el usuario del dispositivo, los datos locales son de otro repo: se descartan.
  const previous = await getKV<string>('owner')
  if (previous && previous !== email) {
    await Promise.all([db.notes.clear(), db.assets.clear(), delKV('lastSyncAt'), delKV('credentials')])
    credentials.value = null
  }
  const s: Session = { email, sub: claims.sub, name: claims.name, picture: claims.picture }
  await setKV('session', s)
  await setKV('owner', email)
  session.value = s
  await unlockRepo()
}

/**
 * Descifra el token de GitHub embebido en el bundle con la cuenta de Google de la sesión,
 * lo valida contra el repo del usuario y lo guarda en este dispositivo.
 */
export async function unlockRepo(): Promise<void> {
  const s = session.value
  const cfg = userConfig(s?.email)
  if (!s || !cfg) throw new Error('Invalid session.')

  const sealed = __FINDEGIL_VAULT__[s.email]
  if (!sealed) throw new UnlockError('missing', 'This build of the app does not include access to your notes.')
  const token = await openToken(sealed, s.sub, s.email)
  if (!token) throw new UnlockError('mismatch', 'The access bundled in the app does not match this Google account.')

  // Octokit se carga bajo demanda para no engordar el arranque de la app.
  const { fetchRepoInfo, isStatus, UnauthorizedError } = await import('../github/client')
  let info
  try {
    info = await fetchRepoInfo(token, cfg.owner, cfg.repo)
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      throw new UnlockError('expired', 'The GitHub access token has expired or was revoked.')
    }
    // 404/403: el token es válido pero no ve el repo (p. ej. se recreó y el token apunta al antiguo).
    if (isStatus(err, 403, 404)) {
      throw new UnlockError(
        'no-access',
        `The access token can't see ${cfg.owner}/${cfg.repo}. If the repository was recreated, add it to the token's repository access on GitHub.`,
      )
    }
    throw new UnlockError('no-access', 'Could not reach the notes repository. Are you online?')
  }
  if (!info.canPush) throw new UnlockError('no-access', 'The token has no write permission (Contents: Read and write).')
  if (!info.isPrivate) throw new UnlockError('no-access', 'The notes repository must be private.')

  const creds: Credentials = { token, owner: cfg.owner, repo: cfg.repo, branch: info.defaultBranch }
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
