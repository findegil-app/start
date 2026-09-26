<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NoteEditor from '../editor/NoteEditor.vue'
import { KIND_PLURAL } from '../lib/para'
import { openMove, useContainers } from '../stores/containers'
import { deleteNote, updateNote, useNote } from '../stores/notes'
import DueControls from './DueControls.vue'
import TagInput from './TagInput.vue'

const props = defineProps<{ noteId: string }>()
const emit = defineEmits<{ close: [] }>()
const route = useRoute()
const router = useRouter()
const note = useNote(computed(() => props.noteId))
const containers = useContainers()

const title = ref('')
const tags = ref<string[]>([])
const titleInput = ref<HTMLTextAreaElement>()
const editorRef = ref<InstanceType<typeof NoteEditor>>()
let titleTimer: ReturnType<typeof setTimeout> | undefined
let loaded = false

watch(
  note,
  async (n) => {
    if (!n) return
    if (!loaded || document.activeElement !== titleInput.value) title.value = n.title
    tags.value = [...n.tags]
    if (!loaded) {
      loaded = true
      if (route.query.new) {
        await nextTick()
        titleInput.value?.focus()
        void router.replace({ query: { ...route.query, new: undefined } })
      }
    }
  },
  { immediate: true },
)

const crumb = computed(() => {
  const n = note.value
  if (!n) return null
  if (n.bucket === 'inbox') return { label: 'Landing Zone', to: { name: 'inbox' } }
  if (n.bucket === 'scratch') return { label: 'Scratch', to: { name: 'scratch' } }
  const c = n.containerId ? containers.value?.byId.get(n.containerId) : undefined
  if (!c) return { label: '…', to: { name: 'inbox' } }
  const root = c.status === 'archived' ? `Archive › ${KIND_PLURAL[c.kind]}` : KIND_PLURAL[c.kind]
  return { label: `${root} › ${c.name}`, to: { name: 'container', params: { cid: c.id } } }
})

function flushTitle() {
  if (!titleTimer) return
  clearTimeout(titleTimer)
  titleTimer = undefined
  void updateNote(props.noteId, { title: title.value.trim() })
}

function onTitleInput() {
  clearTimeout(titleTimer)
  titleTimer = setTimeout(flushTitle, 300)
}

function onTitleEnter(e: KeyboardEvent) {
  e.preventDefault()
  flushTitle()
  editorRef.value?.focus()
}

function onTags(next: string[]) {
  tags.value = next
  void updateNote(props.noteId, { tags: next })
}

async function remove() {
  if (!note.value || !confirm('Delete this note? It will also be removed from the repository.')) return
  await deleteNote(note.value.id)
  emit('close')
}

onBeforeUnmount(flushTitle)
</script>

<template>
  <article v-if="note" class="note-view">
    <div class="note-topbar">
      <button type="button" class="icon-btn back" aria-label="Back to list" @click="emit('close')">‹</button>
      <RouterLink v-if="crumb" :to="crumb.to" class="crumb">{{ crumb.label }}</RouterLink>
      <span class="spacer" />
      <button type="button" class="ghost small" title="Move to… (M)" @click="openMove(note.id)">↗ Move</button>
      <button type="button" class="icon-btn danger" title="Delete note" aria-label="Delete note" @click="remove">🗑</button>
    </div>
    <textarea
      ref="titleInput"
      v-model="title"
      class="title-input"
      rows="1"
      placeholder="Title"
      aria-label="Title"
      @input="onTitleInput"
      @blur="flushTitle"
      @keydown.enter="onTitleEnter"
    />
    <DueControls :note="note" />
    <TagInput :model-value="tags" @update:model-value="onTags" />
    <NoteEditor :key="note.id" ref="editorRef" :note-id="note.id" :content="note.content" />
  </article>
  <div v-else-if="note === null" class="placeholder muted">
    <p>This note doesn't exist or was deleted.</p>
    <button type="button" class="ghost" @click="emit('close')">Back</button>
  </div>
</template>
