<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NoteListItem from '../components/NoteListItem.vue'
import NotePane from '../components/NotePane.vue'
import { db } from '../db'
import { daysUntil, formatDate } from '../lib/dates'
import { KIND_LABEL } from '../lib/para'
import {
  archiveContainer,
  deleteContainer,
  openContainerDialog,
  openMove,
  restoreContainer,
  updateContainer,
  useContainer,
} from '../stores/containers'
import { deleteWithUndo } from '../composables/useDeleteNote'
import { focusMode, toggleFocus } from '../stores/layout'
import { createNote, useLiveQuery, useNotesIn, type Location } from '../stores/notes'

const emit = defineEmits<{ menu: [] }>()
const route = useRoute()
const router = useRouter()
const search = ref('')

const cid = computed(() => (route.name === 'container' ? (route.params.cid as string) : null))
const container = useContainer(() => cid.value)
const location = computed<Location | null>(() => {
  if (route.name === 'inbox') return { bucket: 'inbox' }
  if (route.name === 'scratch') return { bucket: 'scratch' }
  return cid.value ? { bucket: 'container', containerId: cid.value } : null
})
const notes = useNotesIn(location, search)
const openId = computed(() => (route.query.n as string | undefined) ?? null)

// Progreso de un proyecto: casillas de tareas en todas sus notas.
const tasks = useLiveQuery(
  async () => {
    if (!cid.value) return { done: 0, total: 0 }
    let done = 0
    let total = 0
    await db.notes
      .where('containerId')
      .equals(cid.value)
      .each((n) => {
        if (n.syncStatus === 'deleted') return
        for (const m of n.content.matchAll(/^\s*[-*]\s+\[([ xX])\]/gm)) {
          total++
          if (m[1] !== ' ') done++
        }
        if (n.due) {
          total++
          if (n.done) done++
        }
      })
    return { done, total }
  },
  () => cid.value,
)

const title = computed(() => {
  if (route.name === 'inbox') return 'Landing Zone'
  if (route.name === 'scratch') return 'Scratch'
  return container.value?.name ?? ''
})
const kicker = computed(() => {
  if (route.name === 'inbox') return 'Inbox'
  if (route.name === 'scratch') return 'Temporary'
  const c = container.value
  return c ? `${c.status === 'archived' ? 'Archived ' : ''}${KIND_LABEL[c.kind]}` : ''
})
const hint = computed(() => {
  if (route.name === 'inbox') return 'Capture first, classify later: press M or drag a note onto the sidebar.'
  if (route.name === 'scratch') return 'Quick lists that never get classified. Delete them when done.'
  return ''
})

function open(id: string | null) {
  void router.push({ query: id ? { n: id } : {} })
}

async function newNote() {
  const id = await createNote(location.value ?? { bucket: 'inbox' })
  await router.push({ query: { n: id, new: '1' } })
}

function rename() {
  const c = container.value
  if (c) openContainerDialog({ kind: c.kind, id: c.id, name: c.name })
}

async function toggleArchive() {
  const c = container.value
  if (!c) return
  if (c.status === 'archived') await restoreContainer(c.id)
  else if (confirm(`Archive "${c.name}"? Its notes move to Archive and can be restored anytime.`)) await archiveContainer(c.id)
}

async function remove() {
  const c = container.value
  if (!c || !confirm(`Delete "${c.name}"?`)) return
  try {
    await deleteContainer(c.id)
    await router.replace({ name: 'inbox' })
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err))
  }
}

function setDeadline(e: Event) {
  const c = container.value
  if (c) void updateContainer(c.id, { deadline: (e.target as HTMLInputElement).value || null })
}

/** Borra y, si era la nota abierta, pasa a la siguiente de la lista. */
async function removeNote(id: string) {
  const list = notes.value ?? []
  const i = list.findIndex((n) => n.id === id)
  const next = list[i + 1] ?? list[i - 1]
  await deleteWithUndo(id)
  if (openId.value === id) open(next && next.id !== id ? next.id : null)
}

// Ctrl/⌘ + \ muestra u oculta el listado, también mientras se escribe.
function onGlobalKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === '\\' && openId.value) {
    e.preventDefault()
    toggleFocus()
  }
}
onMounted(() => window.addEventListener('keydown', onGlobalKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey))

function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  if (e.ctrlKey || e.metaKey || e.altKey || t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return
  const list = notes.value ?? []
  const i = list.findIndex((n) => n.id === openId.value)
  if ((e.key === 'Delete' || e.key === 'Backspace') && openId.value) {
    e.preventDefault()
    void removeNote(openId.value)
  } else if (e.key === 'm' && openId.value) {
    e.preventDefault()
    openMove(openId.value)
  } else if (e.key === 'j' || e.key === 'ArrowDown') {
    e.preventDefault()
    if (list[i + 1]) open(list[i + 1].id)
  } else if (e.key === 'k' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (i > 0) open(list[i - 1].id)
  }
}
</script>

<template>
  <div class="section" :class="{ 'has-note': openId, focus: focusMode && openId }" tabindex="-1" @keydown="onKey">
    <section class="list-pane">
      <header class="list-head">
        <div class="list-title">
          <button type="button" class="icon-btn menu-btn" aria-label="Menu" @click="emit('menu')">☰</button>
          <div>
            <div class="kicker">{{ kicker }}</div>
            <h2>{{ title }}</h2>
          </div>
          <button v-if="container" type="button" class="icon-btn" title="Rename" @click="rename">✎</button>
        </div>

        <div v-if="container" class="container-meta">
          <label v-if="container.kind === 'project'" class="chip deadline" :class="{ danger: container.deadline && daysUntil(container.deadline) <= 7 }">
            📅 {{ container.deadline ? `Due ${formatDate(container.deadline, false)}` : 'Set deadline' }}
            <input type="date" :value="container.deadline ?? ''" @change="setDeadline" />
          </label>
          <span class="chip out">{{ notes?.length ?? 0 }} notes</span>
          <span v-if="tasks?.total" class="chip out">{{ tasks.done }}/{{ tasks.total }} done</span>
          <span class="spacer" />
          <button type="button" class="ghost small" @click="toggleArchive">{{ container.status === 'archived' ? 'Restore' : 'Archive' }}</button>
          <button v-if="!notes?.length" type="button" class="icon-btn danger" title="Delete" @click="remove">🗑</button>
        </div>
        <div v-if="container && tasks?.total" class="progress"><div :style="{ width: `${(100 * tasks.done) / tasks.total}%` }" /></div>
        <p v-if="hint" class="hint">{{ hint }}</p>

        <div class="list-tools">
          <input v-model="search" type="search" placeholder="Search… (#tag)" aria-label="Search notes" />
          <button type="button" class="primary" @click="newNote">＋ Note</button>
        </div>
      </header>

      <nav class="note-list" aria-label="Notes">
        <NoteListItem
          v-for="n in notes"
          :key="n.id"
          :note="n"
          :active="n.id === openId"
          :show-move="route.name === 'inbox'"
          @open="open(n.id)"
          @move="openMove(n.id)"
          @delete="removeNote(n.id)"
        />
        <p v-if="notes && !notes.length" class="empty muted">
          {{ search ? 'No results.' : route.name === 'inbox' ? 'Landing Zone is empty. Nice.' : 'No notes here yet.' }}
        </p>
      </nav>
    </section>

    <main class="content">
      <NotePane v-if="openId" :key="openId" :note-id="openId" @close="open(null)" />
      <div v-else class="placeholder muted"><p>Select a note or create a new one.</p></div>
    </main>
  </div>
</template>
