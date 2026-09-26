<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { DEFAULT_REPO, login } from '../stores/auth'

const router = useRouter()
const logo = `${import.meta.env.BASE_URL}logo.svg`
const token = ref('')
const repo = ref(DEFAULT_REPO)
const error = ref('')
const submitting = ref(false)

async function submit() {
  error.value = ''
  submitting.value = true
  try {
    await login(token.value, repo.value)
    token.value = ''
    await router.replace({ name: 'home' })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    submitting.value = false
  }
}

const tokenUrl =
  'https://github.com/settings/personal-access-tokens/new?name=Findegil&description=Findegil%20notes&contents=write'
</script>

<template>
  <main class="login">
    <form class="login-card" @submit.prevent="submit">
      <img :src="logo" alt="" class="login-logo" width="64" height="64" />
      <h1>Findegil</h1>
      <p class="muted">Tus notas, primero en este dispositivo y respaldadas en tu repositorio privado de GitHub.</p>

      <label>
        Repositorio de notas
        <input v-model="repo" autocomplete="off" autocapitalize="off" spellcheck="false" required placeholder="owner/repo" />
      </label>

      <label>
        Personal Access Token (fine-grained)
        <input
          v-model="token"
          type="password"
          autocomplete="off"
          spellcheck="false"
          required
          placeholder="github_pat_…"
        />
      </label>

      <details class="help">
        <summary>¿Cómo creo el token?</summary>
        <ol>
          <li>
            Abre <a :href="tokenUrl" target="_blank" rel="noopener">GitHub → Fine-grained tokens</a>.
          </li>
          <li><em>Repository access</em>: <strong>Only select repositories</strong> → <code>{{ repo }}</code>.</li>
          <li><em>Permissions → Contents</em>: <strong>Read and write</strong>. Nada más.</li>
        </ol>
        <p>El token solo se guarda en este dispositivo (IndexedDB) y solo se envía a api.github.com.</p>
      </details>

      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button class="primary" type="submit" :disabled="submitting">
        {{ submitting ? 'Verificando…' : 'Entrar' }}
      </button>
    </form>
  </main>
</template>
