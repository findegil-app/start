<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { db, type Container, type ContainerKind, type Note } from '../db'
import { formatDate } from '../lib/dates'
import { KIND_LABEL } from '../lib/para'
import { createContainer, openContainerDialog, ui, useContainers } from '../stores/containers'
import { moveNote, type Location } from '../stores/notes'

type Item =
  | { type: 'container'; c: Container; group: string }
  | { type: 'bucket'; to: Location; label: string; icon: string; hint: string; group: string }
  | { type: 'create'; kind: ContainerKind; name: string; group: string }

const route = useRoute()
const router = useRouter()
const containers = useContainers()
const query = ref('')
const index = ref(0)
const input = ref<HTMLInputElement>()
const note = ref<Note | null>(null)

watch(
  () => ui.moveNoteId,
  async (id) => {
    note.value = id ? ((await db.notes.get(id)) ?? null) : null
    query.value = ''
    index.value = 0
    if (id) {
      await nextTick()
      input.value?.focus()
    }
  },
)

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const ICON: Record<ContainerKind, string> = { project: '●', area: '◇', resource: '○' }

/** Sugerencias: contenedores cuyo nombre aparece en el título o el contenido de la nota. */
function score(c: Container, text: string) {
  const words = norm(c.name).split(/\W+/).filter((w) => w.length >= 3)
  return words.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0) / Math.max(words.length, 1)
}

const items = computed<Item[]>(() => {
  const n = note.value
  const all = containers.value
  if (!n || !all) return []
  const q = norm(query.value.trim())
  const active = [...all.project, ...all.area, ...all.resource].filter((c) => c.id !== n.containerId)
  const match = (c: Container) => !q || norm(c.name).includes(q)
  const out: Item[] = []

  const text = norm(`${n.title} ${n.content}`)
  const suggested = active
    .map((c) => ({ c, s: score(c, text) }))
    .filter((x) => x.s > 0 && match(x.c))
    .sort((a, b) => b.s - a.s)
    .slice(0, 2)
  for (const { c } of suggested) out.push({ type: 'container', c, group: 'Suggested' })
  const taken = new Set(suggested.map((x) => x.c.id))

  for (const kind of ['project', 'area', 'resource'] as const) {
    for (const c of all[kind]) if (c.id !== n.containerId && !taken.has(c.id) && match(c)) out.push({ type: 'container', c, group: `${KIND_LABEL[kind]}s` })
  }
  const buckets: Item[] = [
    { type: 'bucket', to: { bucket: 'scratch' }, label: 'Scratch', icon: '✎', hint: 'temporary, not classified', group: 'Other' },
    { type: 'bucket', to: { bucket: 'inbox' }, label: 'Landing Zone', icon: '⬇', hint: 'back to inbox', group: 'Other' },
  ]
  for (const b of buckets) {
    if (b.type === 'bucket' && b.to.bucket !== n.bucket && (!q || norm(b.label).includes(q))) out.push(b)
  }
  const name = query.value.trim()
  for (const kind of ['project', 'area', 'resource'] as const) out.push({ type: 'create', kind, name, group: 'Create' })
  return out
})

watch(items, () => (index.value = Math.min(index.value, Math.max(items.value.length - 1, 0))))
// Al escribir, el primer resultado vuelve a ser el seleccionado.
watch(query, () => (index.value = 0))

function close() {
  ui.moveNoteId = null
}

async function done(to: Location) {
  const id = note.value!.id
  await moveNote(id, to)
  close()
  // Si la nota sale de la lista actual, se cierra el editor.
  const here = route.name === 'container' ? { bucket: 'container', containerId: route.params.cid } : { bucket: route.name }
  const leaves =
    here.bucket === 'container' ? to.bucket !== 'container' || to.containerId !== here.containerId : to.bucket !== here.bucket
  if (leaves && route.query.n === id) void router.replace({ query: {} })
}

async function choose(item: Item) {
  if (item.type === 'container') return done({ bucket: 'container', containerId: item.c.id })
  if (item.type === 'bucket') return done(item.to)
  if (item.name) {
    const id = await createContainer(item.kind, item.name)
    return done({ bucket: 'container', containerId: id })
  }
  const noteId = note.value!.id
  close()
  openContainerDialog({ kind: item.kind, then: (id) => void moveNote(noteId, { bucket: 'container', containerId: id }) })
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
  else if (e.key === 'ArrowDown') {
    e.preventDefault()
    index.value = (index.value + 1) % items.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    index.value = (index.value - 1 + items.value.length) % items.value.length
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const item = items.value[index.value]
    if (item) void choose(item)
  }
}

const grouped = computed(() => {
  const groups: { name: string; items: { item: Item; i: number }[] }[] = []
  items.value.forEach((item, i) => {
    let g = groups.find((x) => x.name === item.group)
    if (!g) groups.push((g = { name: item.group, items: [] }))
    g.items.push({ item, i })
  })
  return groups
})
</script>

<template>
  <div v-if="ui.moveNoteId && note" class="overlay" @click.self="close">
    <div class="palette" role="dialog" aria-label="Move note" @keydown="onKey">
      <div class="palette-q">
        <span class="muted">↗ Move “{{ note.title || 'Untitled' }}” to…</span>
        <input ref="input" v-model="query" placeholder="Search or type a new name" aria-label="Search destination" />
      </div>
      <div class="palette-list">
        <template v-for="g in grouped" :key="g.name">
          <div class="palette-group">{{ g.name }}</div>
          <button
            v-for="{ item, i } in g.items"
            :key="i"
            type="button"
            class="palette-row"
            :class="{ on: i === index, create: item.type === 'create' }"
            @mousemove="index = i"
            @click="choose(item)"
          >
            <template v-if="item.type === 'container'">
              <span class="ico" :class="item.c.kind">{{ ICON[item.c.kind] }}</span>{{ item.c.name }}
              <span class="muted small">{{ KIND_LABEL[item.c.kind] }}<template v-if="item.c.deadline"> · Due {{ formatDate(item.c.deadline, false) }}</template></span>
            </template>
            <template v-else-if="item.type === 'bucket'">
              <span class="ico">{{ item.icon }}</span>{{ item.label }} <span class="muted small">{{ item.hint }}</span>
            </template>
            <template v-else>＋ New {{ item.kind }}<template v-if="item.name"> “{{ item.name }}”</template><template v-else>…</template></template>
            <kbd v-if="i === index">↵</kbd>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
