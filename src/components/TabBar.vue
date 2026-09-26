<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useCounts } from '../stores/notes'

const route = useRoute()
const counts = useCounts()
const active = computed(() => {
  const name = route.name as string
  if (['container', 'scratch', 'archive', 'library'].includes(name)) return 'library'
  return name
})
const tabs = [
  { name: 'capture', icon: '✎', label: 'Capture' },
  { name: 'inbox', icon: '⬇', label: 'Landing' },
  { name: 'agenda', icon: '▦', label: 'Agenda' },
  { name: 'library', icon: '◈', label: 'Library' },
]
</script>

<template>
  <nav class="tabbar" aria-label="Main">
    <RouterLink v-for="t in tabs" :key="t.name" :to="{ name: t.name }" class="tab" :class="{ on: active === t.name }">
      <span class="tab-ico">{{ t.icon }}</span>
      <span>{{ t.label }}<span v-if="t.name === 'inbox' && counts?.inbox" class="tab-badge">{{ counts.inbox }}</span></span>
    </RouterLink>
  </nav>
</template>
