import { Capacitor } from '@capacitor/core'

/** true dentro del APK (Capacitor); false en la web / PWA. */
export const isNative = Capacitor.isNativePlatform()

/** URL pública de la web (para la página de retorno del login en el APK). */
export const WEB_URL = 'https://findegil-app.github.io/start/'
