import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { GOOGLE_CLIENT_ID } from '../config/users'
import { decodeIdToken } from './google'
import { WEB_URL } from './platform'

/**
 * Login de Google en el APK. Google no permite su login dentro de WebViews, así que:
 * 1. se abre el navegador del sistema con el flujo OpenID (response_type=id_token);
 * 2. Google vuelve a WEB_URL/oauth.html, que reenvía el token a findegil://auth;
 * 3. Android abre la app y aquí se recoge el token (comprobando el nonce).
 * Requiere tener WEB_URL/oauth.html en "URIs de redireccionamiento autorizados" del cliente OAuth.
 */
export async function nativeGoogleSignIn(): Promise<string> {
  const nonce = crypto.randomUUID()
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    response_type: 'id_token',
    scope: 'openid email profile',
    redirect_uri: `${WEB_URL}oauth.html`,
    nonce,
    prompt: 'select_account',
  })

  return new Promise<string>((resolve, reject) => {
    let done = false
    const finish = (fn: () => void) => {
      if (done) return
      done = true
      void handle.then((h) => h.remove())
      void Browser.close().catch(() => {})
      fn()
    }
    const handle = App.addListener('appUrlOpen', ({ url }) => {
      if (!url.startsWith('findegil://auth')) return
      const q = new URLSearchParams(url.split('?')[1] ?? '')
      const token = q.get('id_token')
      const error = q.get('error')
      if (error || !token) return finish(() => reject(new Error(error ? `Google sign-in failed: ${error}` : 'Google sign-in was cancelled.')))
      if (decodeIdToken(token)?.nonce !== nonce) return finish(() => reject(new Error('Invalid sign-in response (nonce).')))
      finish(() => resolve(token))
    })
    void Browser.open({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, presentationStyle: 'popover' })
  })
}
