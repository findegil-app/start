<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { renderGoogleButton } from '../lib/google'
import { credentials, session, signInWithGoogle, signOut, unlockRepo, UnlockError, type UnlockErrorCode } from '../stores/auth'

const router = useRouter()
const logo = `${import.meta.env.BASE_URL}logo.svg`
const googleBtn = ref<HTMLElement>()
const error = ref('')
const errorCode = ref<UnlockErrorCode | null>(null)
const busy = ref(false)
const copied = ref(false)

async function goHome() {
  if (session.value && credentials.value) await router.replace({ name: 'inbox' })
}

async function run(action: () => Promise<void>) {
  error.value = ''
  errorCode.value = null
  busy.value = true
  try {
    await action()
    await goHome()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    errorCode.value = err instanceof UnlockError ? err.code : null
  } finally {
    busy.value = false
  }
}

async function mountGoogle() {
  if (session.value || !googleBtn.value) return
  try {
    await renderGoogleButton(googleBtn.value, (idToken) => run(() => signInWithGoogle(idToken)))
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function copySub() {
  if (!session.value) return
  await navigator.clipboard.writeText(session.value.sub)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

async function switchAccount() {
  await signOut()
  error.value = ''
  errorCode.value = null
}

onMounted(() => {
  // Sesión de Google ya cacheada pero sin acceso al repo (401, primer arranque offline…): reintentar.
  if (session.value) void run(unlockRepo)
  else void mountGoogle()
})
// Tras cerrar sesión el botón de Google vuelve a montarse.
watch(session, (s) => !s && setTimeout(mountGoogle))
</script>

<template>
  <main class="login">
    <div class="login-card">
      <img :src="logo" alt="" class="login-logo" width="88" height="88" />
      <h1>Findegil</h1>

      <template v-if="!session">
        <p class="muted">Sign in with your Google account.</p>
        <div ref="googleBtn" class="google-btn" />
      </template>

      <div v-else class="token-step">
        <p class="muted">
          Hi, <strong>{{ session.name ?? session.email }}</strong>.
          <template v-if="busy">Connecting to your notes…</template>
        </p>

        <template v-if="errorCode === 'missing' || errorCode === 'mismatch'">
          <p class="error" role="alert">{{ error }}</p>
          <div class="help">
            <p>To set it up, add this ID as the <code>NOTES_GOOGLE_SUB</code> secret in GitHub Actions and re-run the deploy:</p>
            <div class="sub-box">
              <code>{{ session.sub }}</code>
              <button type="button" class="link-btn" @click="copySub">{{ copied ? 'Copied' : 'Copy' }}</button>
            </div>
          </div>
        </template>
        <template v-else-if="errorCode === 'expired'">
          <p class="error" role="alert">{{ error }}</p>
          <p class="help">Create a new token, update the <code>NOTES_TOKEN</code> secret and re-run the deploy.</p>
        </template>
        <p v-else-if="error" class="error" role="alert">{{ error }}</p>

        <button v-if="error" class="primary" type="button" :disabled="busy" @click="run(unlockRepo)">Retry</button>
        <button type="button" class="link-btn" @click="switchAccount">Use another account</button>
      </div>

      <p v-if="error && !session" class="error" role="alert">{{ error }}</p>
    </div>
  </main>
</template>
