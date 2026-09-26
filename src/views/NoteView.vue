<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TagInput from '../components/TagInput.vue'
import NoteEditor from '../editor/NoteEditor.vue'
import { deleteNote, updateNote, useNote } from '../stores/notes'

const route = useRoute()
const router = useRouter()
const id = computed(() => route.params.id as string)
const note = useNote(id)

const title = ref('')
const tags = ref<string[]>([])
const titleInput = ref<HTMLTextAreaElement>()
const editorRef = ref<InstanceType<typeof NoteEditor>>()

let titleTimer: ReturnType<typeof setTimeout> | undefined
let loadedId: string | null = null

// Sincroniza campos locales con la nota (al cambiar de nota o si llega un cambio remoto).
watch(
  note,
  async (n) => {
    if (!n) return
    const switched = loadedId !== n.id
    if (switched || document.activeElement !== titleInput.value) title.value = n.title
    tags.value = [...n.tags]
    if (switched) {
      loadedId = n.id
      if (route.query.new) {
        await nextTick()
        titleInput.value?.focus()
        void router.replace({ query: {} })
      }
    }
  },
  { immediate: true },
)

function flushTitle() {
  if (!titleTimer) return
  clearTimeout(titleTimer)
  titleTimer = undefined
  if (loadedId) void updateNote(loadedId, { title: title.value.trim() })
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
  if (loadedId) void updateNote(loadedId, { tags: next })
}

async function remove() {
  if (!note.value || !confirm('¿Eliminar esta nota? También se borrará del repositorio.')) return
  await deleteNote(note.value.id)
  await router.replace({ name: 'home' })
}

watch(id, flushTitle)
onBeforeUnmount(flushTitle)
</script>

<template>
  <article v-if="note" class="note-view">
    <header class="note-header">
      <RouterLink :to="{ name: 'home' }" class="icon-btn back" aria-label="Volver a la lista">‹</RouterLink>
      <textarea
        ref="titleInput"
        v-model="title"
        class="title-input"
        rows="1"
        placeholder="Título"
        aria-label="Título"
        @input="onTitleInput"
        @blur="flushTitle"
        @keydown.enter="onTitleEnter"
      />
      <button type="button" class="icon-btn danger" title="Eliminar nota" aria-label="Eliminar nota" @click="remove">🗑</button>
    </header>
    <TagInput :model-value="tags" @update:model-value="onTags" />
    <NoteEditor :key="note.id" ref="editorRef" :note-id="note.id" :content="note.content" />
  </article>
  <div v-else-if="note === null" class="placeholder muted">
    <p>Esta nota no existe o fue eliminada.</p>
    <RouterLink :to="{ name: 'home' }">Volver</RouterLink>
  </div>
</template>
