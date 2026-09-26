import { createApp } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import App from './App.vue'
import { isNative } from './lib/platform'
import { router } from './router'
import { loadAuth } from './stores/auth'
import './stores/theme'
import '@fontsource/marcellus/400.css'
import './style.css'

// En el APK los archivos ya van dentro de la app: sin service worker.
if (!isNative) registerSW({ immediate: true })

void loadAuth().then(() => createApp(App).use(router).mount('#app'))
