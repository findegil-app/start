/**
 * Mismo cliente OAuth de Google Cloud que rdr-nfq/team-hub.
 * En Google Cloud Console → Credenciales → este cliente → "Orígenes de JavaScript autorizados" deben estar:
 *   https://findegil-app.github.io, http://localhost:5173 y http://localhost:4173
 */
export const GOOGLE_CLIENT_ID = '535974839401-54e3t5n61nbc0c31corcfr56gplj8svl.apps.googleusercontent.com'

export interface UserConfig {
  /** Repositorio privado que actúa como base de datos de notas de este usuario. */
  owner: string
  repo: string
}

/** Cuentas de Google autorizadas y su repositorio de notas. Solo estas pueden entrar. */
export const USERS: Record<string, UserConfig> = {
  'pablo.llorente@nfq.es': { owner: 'pablo-cere', repo: 'red-notes' },
}

export const normEmail = (email: string | null | undefined) => (email ?? '').trim().toLowerCase()

export function userConfig(email: string | null | undefined): UserConfig | null {
  return USERS[normEmail(email)] ?? null
}
