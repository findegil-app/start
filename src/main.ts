import { createApp } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import App from './App.vue'
import { router } from './router'
import { loadCredentials } from './stores/auth'
import './style.css'

registerSW({ immediate: true })

void loadCredentials().then(() => createApp(App).use(router).mount('#app'))
