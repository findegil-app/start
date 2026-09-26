<script setup lang="ts">
import { computed } from 'vue'
import { usePendingCount } from '../stores/notes'
import { requestSync, syncStatus } from '../sync/controller'

const pending = usePendingCount()

const label = computed(() => {
  const plural = pending.value === 1 ? 'pendiente' : 'pendientes'
  switch (syncStatus.state) {
    case 'syncing':
      return 'Sincronizando'
    case 'offline':
      return pending.value ? `Sin conexión · ${pending.value} ${plural}` : 'Sin conexión'
    case 'error':
      return 'Error de sincronización'
    default:
      return pending.value ? `${pending.value} ${plural}` : 'Sincronizado'
  }
})

const title = computed(() => {
  const last = syncStatus.lastSyncAt ? new Date(syncStatus.lastSyncAt).toLocaleString() : 'nunca'
  return [`Última sincronización: ${last}`, syncStatus.lastError, 'Pulsa para sincronizar ahora'].filter(Boolean).join('\n')
})

const tone = computed(() => {
  if (syncStatus.state === 'error') return 'error'
  if (syncStatus.state === 'offline') return 'offline'
  if (syncStatus.state === 'syncing') return 'syncing'
  return pending.value ? 'pending' : 'ok'
})
</script>

<template>
  <button type="button" class="sync-indicator" :data-tone="tone" :title="title" @click="requestSync()">
    <span class="dot" aria-hidden="true" />
    <span class="text">{{ label }}</span>
  </button>
</template>
