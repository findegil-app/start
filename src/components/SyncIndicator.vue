<script setup lang="ts">
import { computed } from 'vue'
import { usePendingCount } from '../stores/notes'
import { requestSync, syncStatus } from '../sync/controller'

const pending = usePendingCount()

const label = computed(() => {
  const plural = 'pending'
  switch (syncStatus.state) {
    case 'syncing':
      return 'Syncing'
    case 'offline':
      return pending.value ? `Offline · ${pending.value} ${plural}` : 'Offline'
    case 'error':
      return 'Sync error'
    default:
      return pending.value ? `${pending.value} ${plural}` : 'Synced'
  }
})

const title = computed(() => {
  const last = syncStatus.lastSyncAt ? new Date(syncStatus.lastSyncAt).toLocaleString() : 'never'
  return [`Last sync: ${last}`, syncStatus.lastError, 'Click to sync now'].filter(Boolean).join('\n')
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
