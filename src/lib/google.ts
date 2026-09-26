import { GOOGLE_CLIENT_ID } from '../config/users'

interface CredentialResponse {
  credential: string
}

interface GoogleId {
  initialize(opts: Record<string, unknown>): void
  renderButton(el: HTMLElement, opts: Record<string, unknown>): void
  prompt(): void
  disableAutoSelect(): void
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } }
  }
}

export interface GoogleIdClaims {
  sub: string
  email: string
  email_verified: boolean
  name?: string
  picture?: string
  hd?: string
  aud: string
  iss: string
  exp: number
}

let loading: Promise<GoogleId> | null = null

/** Carga Google Identity Services bajo demanda (requiere conexión; la sesión se cachea para uso offline). */
export function loadGoogleIdentity(): Promise<GoogleId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id)
  loading ??= new Promise<GoogleId>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('GIS no disponible')))
    script.onerror = () => {
      loading = null
      reject(new Error('No se pudo cargar Google Sign-In. ¿Sin conexión?'))
    }
    document.head.append(script)
  })
  return loading
}

export function decodeIdToken(token: string): GoogleIdClaims | null {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
    return JSON.parse(json)
  } catch {
    return null
  }
}

/** Comprobaciones de las claims (sin verificar firma: no hay backend; ver README). */
export function validClaims(c: GoogleIdClaims | null): c is GoogleIdClaims {
  return (
    !!c &&
    c.aud === GOOGLE_CLIENT_ID &&
    (c.iss === 'https://accounts.google.com' || c.iss === 'accounts.google.com') &&
    c.exp * 1000 > Date.now() &&
    c.email_verified === true
  )
}

export async function renderGoogleButton(el: HTMLElement, onCredential: (idToken: string) => void) {
  const gid = await loadGoogleIdentity()
  gid.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (r: CredentialResponse) => onCredential(r.credential),
    auto_select: true,
    cancel_on_tap_outside: false,
  })
  gid.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', width: 280, locale: 'es' })
  gid.prompt()
}

export function googleSignOut() {
  try {
    window.google?.accounts?.id?.disableAutoSelect()
  } catch {
    // GIS no cargado: nada que hacer.
  }
}
