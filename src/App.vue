<script setup lang="ts">
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { credentials, logout } from './stores/auth'
import { startSync, stopSync } from './sync/controller'

const router = useRouter()

// 401 → borrar token, parar el motor y volver al login.
async function onUnauthorized() {
  await logout()
  await router.replace({ name: 'login' })
}

watch(
  () => credentials.value?.token,
  (token) => (token ? void startSync(onUnauthorized) : stopSync()),
  { immediate: true },
)
</script>

<template>
  <RouterView />
</template>
