/**
 * "Caja fuerte" del token de GitHub embebido en el bundle.
 *
 * El token se cifra en build (AES-256-GCM) con una clave derivada (PBKDF2-SHA256, 600k iteraciones)
 * del identificador interno de la cuenta de Google del usuario (`sub`) + su email. El `sub` no aparece
 * en el código ni en el repo: solo llega en el ID token al iniciar sesión con Google. Sin esa cuenta,
 * el texto cifrado del bundle no sirve de nada. Funciona en navegador y en Node (vite.config).
 */
export interface SealedToken {
  salt: string
  iv: string
  ct: string
}

export type Vault = Record<string, SealedToken>

const ITERATIONS = 600_000
const enc = new TextEncoder()

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function deriveKey(sub: string, email: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey('raw', enc.encode(`findegil:${sub}:${email}`), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function sealToken(token: string, sub: string, email: string): Promise<SealedToken> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(sub, email, salt)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(token)))
  return { salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) }
}

/** Devuelve el token, o null si la cuenta no corresponde (falla la autenticación GCM). */
export async function openToken(sealed: SealedToken, sub: string, email: string): Promise<string | null> {
  try {
    const key = await deriveKey(sub, email, fromB64(sealed.salt))
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(sealed.iv) }, key, fromB64(sealed.ct))
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}
