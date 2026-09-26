<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { userConfig } from '../config/users'
import { renderGoogleButton } from '../lib/google'
import { credentials, session, setGitHubToken, signInWithGoogle, signOut } from '../stores/auth'

const router = useRouter()
const logo = `${import.meta.env.BASE_URL}logo.svg`
const googleBtn = ref<HTMLElement>()
const token = ref('')
const error = ref('')
const busy = ref(false)

async function goHome() {
  if (session.value && credentials.value) await router.replace({ name: 'home' })
}

async function onGoogle(idToken: string) {
  error.value = ''
  try {
    await signInWithGoogle(idToken)
    await goHome()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function mountGoogle() {
  if (session.value || !googleBtn.value) return
  try {
    await renderGoogleButton(googleBtn.value, onGoogle)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function submitToken() {
  error.value = ''
  busy.value = true
  try {
    await setGitHubToken(token.value)
    token.value = ''
    await goHome()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function switchAccount() {
  await signOut()
  error.value = ''
}

onMounted(mountGoogle)
// Tras cerrar sesión el botón de Google vuelve a montarse.
watch(session, (s) => !s && setTimeout(mountGoogle))

const tokenUrl = 'https://github.com/settings/personal-access-tokens/new?name=Findegil&contents=write'
const repoName = () => {
  const cfg = userConfig(session.value?.email)
  return cfg ? `${cfg.owner}/${cfg.repo}` : ''
}
</script>

<template>
  <main class="login">
    <div class="login-card">
      <img :src="logo" alt="" class="login-logo" width="64" height="64" />
      <h1>Findegil</h1>

      <template v-if="!session">
        <p class="muted">Inicia sesión con tu cuenta de Google.</p>
        <div ref="googleBtn" class="google-btn" />
      </template>

      <form v-else class="token-step" @submit.prevent="submitToken">
        <p class="muted">
          Hola, <strong>{{ session.name ?? session.email }}</strong>. Primera vez en este dispositivo: conecta tu
          almacenamiento de notas.
        </p>
        <label>
          Token de GitHub
          <input v-model="token" type="password" autocomplete="off" spellcheck="false" required placeholder="github_pat_…" />
        </label>
        <details class="help">
          <summary>¿Cómo creo el token?</summary>
          <ol>
            <li>Abre <a :href="tokenUrl" target="_blank" rel="noopener">GitHub → Fine-grained tokens</a>.</li>
            <li><em>Repository access</em>: <strong>Only select repositories</strong> → <code>{{ repoName() }}</code>.</li>
            <li><em>Permissions → Contents</em>: <strong>Read and write</strong>.</li>
          </ol>
          <p>Se guarda solo en este dispositivo y solo se envía a api.github.com.</p>
        </details>
        <button class="primary" type="submit" :disabled="busy">{{ busy ? 'Verificando…' : 'Conectar' }}</button>
        <button type="button" class="link-btn" @click="switchAccount">Usar otra cuenta</button>
      </form>

      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </div>
  </main>
</template>
