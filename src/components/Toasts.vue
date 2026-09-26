<script setup lang="ts">
import { dismissToast, toasts } from '../stores/toast'
</script>

<template>
  <div class="toasts" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" class="toast">
      <span>{{ t.message }}</span>
      <button
        v-if="t.action"
        type="button"
        class="toast-action"
        @click="
          () => {
            t.action!.run()
            dismissToast(t.id)
          }
        "
      >
        {{ t.action.label }}
      </button>
      <button type="button" class="toast-close" aria-label="Dismiss" @click="dismissToast(t.id)">✕</button>
    </div>
  </div>
</template>
