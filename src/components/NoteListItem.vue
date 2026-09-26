<script setup lang="ts">
import { computed } from 'vue'
import { dueTone, formatDate } from '../lib/dates'
import type { NoteSummary } from '../stores/notes'

const props = defineProps<{ note: NoteSummary; active: boolean; showMove?: boolean; location?: string }>()
const emit = defineEmits<{ open: []; move: []; delete: [] }>()

const tone = computed(() => (props.note.due ? dueTone(props.note.due, props.note.done) : null))

function formatUpdated(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('application/x-findegil-note', props.note.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
</script>

<template>
  <div
    class="note-item"
    :class="{ active, done: note.done }"
    role="button"
    tabindex="0"
    draggable="true"
    @click="emit('open')"
    @keydown.enter="emit('open')"
    @dragstart="onDragStart"
  >
    <div class="note-item-main">
      <div class="note-item-head">
        <strong>{{ note.title || 'Untitled' }}</strong>
        <span v-if="note.syncStatus === 'pending'" class="pending-dot" title="Waiting to sync" />
      </div>
      <p v-if="location" class="location">{{ location }}</p>
      <p v-if="note.excerpt" class="excerpt">{{ note.excerpt }}</p>
      <div class="note-item-meta">
        <span v-if="note.due" class="chip small" :class="tone">{{ note.done ? '✓ ' : '📅 ' }}{{ formatDate(note.due) }}</span>
        <span v-if="note.remind && !note.done" class="chip small out">🔔</span>
        <time :datetime="note.updatedAt">{{ formatUpdated(note.updatedAt) }}</time>
        <span v-for="t in note.tags.slice(0, 3)" :key="t" class="tag small">#{{ t }}</span>
      </div>
    </div>
    <div class="row-actions">
      <button v-if="showMove" type="button" class="ghost small" title="Move to… (M)" @click.stop="emit('move')">Move to…</button>
      <button type="button" class="icon-btn danger" title="Delete (Del)" aria-label="Delete note" @click.stop="emit('delete')">🗑</button>
    </div>
  </div>
</template>
