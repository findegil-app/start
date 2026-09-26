<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Container, ContainerKind } from '../db'
import { daysUntil, formatDate } from '../lib/dates'
import { KIND_PLURAL } from '../lib/para'
import { session, signOut } from '../stores/auth'
import { openContainerDialog, useContainers } from '../stores/containers'
import { moveNote, useCounts, type Location } from '../stores/notes'
import { cycleTheme, THEME_LABEL, themeMode } from '../stores/theme'
import { useAgenda } from '../stores/agenda'
import { toLocalDate } from '../lib/dates'
import SyncIndicator from './SyncIndicator.vue'

const emit = defineEmits<{ capture: []; navigate: [] }>()
const route = useRoute()
const router = useRouter()
const containers = useContainers()
const counts = useCounts()
const agenda = useAgenda()
const dueToday = computed(() => (agenda.value ?? []).filter((i) => !i.done && i.due.slice(0, 10) <= toLocalDate(new Date())).length)
const logo = `${import.meta.env.BASE_URL}logo.svg`

const sections: { kind: ContainerKind; icon: string }[] = [
  { kind: 'project', icon: '●' },
  { kind: 'area', icon: '◇' },
  { kind: 'resource', icon: '○' },
]

const activeCid = computed(() => (route.name === 'container' ? (route.params.cid as string) : null))

function deadlineLabel(c: Container) {
  if (!c.deadline) return ''
  const d = daysUntil(c.deadline)
  if (d < 0) return 'overdue'
  if (d <= 7) return `${d}d`
  return formatDate(c.deadline, false)
}

// Arrastrar una nota desde la lista y soltarla aquí la clasifica.
function onDrop(e: DragEvent, to: Location) {
  const id = e.dataTransfer?.getData('application/x-findegil-note')
  if (id) void moveNote(id, to)
}
const dropProps = (to: Location) => ({
  onDragover: (e: DragEvent) => e.dataTransfer?.types.includes('application/x-findegil-note') && e.preventDefault(),
  onDrop: (e: DragEvent) => onDrop(e, to),
})

function add(kind: ContainerKind) {
  openContainerDialog({ kind, then: (id) => router.push({ name: 'container', params: { cid: id } }) })
}

async function logout() {
  if (!confirm('Sign out on this device?')) return
  await signOut()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <aside class="sidebar">
    <header class="sidebar-header">
      <div class="brand"><img :src="logo" alt="" width="28" height="28" /><span>Findegil</span></div>
      <button type="button" class="icon-btn" :title="THEME_LABEL[themeMode]" :aria-label="THEME_LABEL[themeMode]" @click="cycleTheme">
        {{ themeMode === 'light' ? '☀' : themeMode === 'dark' ? '☾' : '◐' }}
      </button>
    </header>

    <button type="button" class="primary capture-btn" title="New note in Landing Zone (N)" @click="emit('capture')">
      ＋ Capture <kbd>N</kbd>
    </button>

    <nav class="nav" @click="emit('navigate')">
      <RouterLink :to="{ name: 'inbox' }" class="nav-item" v-bind="dropProps({ bucket: 'inbox' })">
        <span class="ico">⬇</span>Landing Zone
        <span v-if="counts?.inbox" class="badge">{{ counts.inbox }}</span>
      </RouterLink>
      <RouterLink :to="{ name: 'agenda' }" class="nav-item">
        <span class="ico">▦</span>Calendar<span v-if="dueToday" class="count">{{ dueToday }} today</span>
      </RouterLink>
      <RouterLink :to="{ name: 'scratch' }" class="nav-item" v-bind="dropProps({ bucket: 'scratch' })">
        <span class="ico">✎</span>Scratch<span v-if="counts?.scratch" class="count">{{ counts.scratch }}</span>
      </RouterLink>

      <template v-for="s in sections" :key="s.kind">
        <div class="nav-label">
          {{ KIND_PLURAL[s.kind] }}
          <button type="button" class="icon-btn tiny" :title="`New ${s.kind}`" @click.stop="add(s.kind)">＋</button>
        </div>
        <RouterLink
          v-for="c in containers?.[s.kind]"
          :key="c.id"
          :to="{ name: 'container', params: { cid: c.id } }"
          class="nav-item"
          :class="{ 'router-link-active': activeCid === c.id }"
          v-bind="dropProps({ bucket: 'container', containerId: c.id })"
        >
          <span class="ico" :class="s.kind">{{ s.icon }}</span><span class="name">{{ c.name }}</span>
          <span v-if="c.deadline" class="count" :class="{ danger: daysUntil(c.deadline) <= 7 }">{{ deadlineLabel(c) }}</span>
          <span v-else-if="counts?.byContainer.get(c.id)" class="count">{{ counts.byContainer.get(c.id) }}</span>
        </RouterLink>
        <p v-if="containers && !containers[s.kind].length" class="nav-empty">No {{ KIND_PLURAL[s.kind].toLowerCase() }} yet</p>
      </template>

      <RouterLink :to="{ name: 'archive' }" class="nav-item archive-link">
        <span class="ico">▤</span>Archive<span v-if="containers?.archived.length" class="count">{{ containers.archived.length }}</span>
      </RouterLink>
    </nav>

    <footer class="sidebar-footer">
      <SyncIndicator />
      <button type="button" class="account" :title="`${session?.email} · Sign out`" @click="logout">
        <img v-if="session?.picture" :src="session.picture" alt="" width="20" height="20" referrerpolicy="no-referrer" />
        {{ session?.name?.split(' ')[0] ?? session?.email }}
      </button>
    </footer>
  </aside>
</template>
