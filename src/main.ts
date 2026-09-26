import { createApp } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import App from './App.vue'
import { router } from './router'
import { loadAuth } from './stores/auth'
import '@fontsource/marcellus/400.css'
import './style.css'

registerSW({ immediate: true })

void loadAuth().then(() => createApp(App).use(router).mount('#app'))
