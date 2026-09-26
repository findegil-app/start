<script setup lang="ts">
import { computed, ref } from 'vue'
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

// Deslizar (solo táctil): → Move to…, ← borrar.
const SWIPE = 90
const dx = ref(0)
let startX = 0
let startY = 0
let tracking = false
let swiped = false
function onPointerDown(e: PointerEvent) {
  if (e.pointerType !== 'touch') return
  startX = e.clientX
  startY = e.clientY
  tracking = true
  swiped = false
}
function onPointerMove(e: PointerEvent) {
  if (!tracking) return
  const x = e.clientX - startX
  if (Math.abs(e.clientY - startY) > 24 && Math.abs(x) < 24) {
    tracking = false
    dx.value = 0
    return
  }
  dx.value = Math.max(-140, Math.min(140, x))
  if (Math.abs(x) > 8) swiped = true
}
function onPointerUp() {
  if (!tracking) return
  tracking = false
  if (dx.value > SWIPE) emit('move')
  else if (dx.value < -SWIPE) emit('delete')
  dx.value = 0
}
function onClick() {
  if (swiped) swiped = false
  else emit('open')
}

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('application/x-findegil-note', props.note.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
</script>

<template>
  <div class="swipe-wrap" :class="{ swiping: dx !== 0 }">
  <div class="swipe-bg" :class="dx > 0 ? 'right' : 'left'" :style="{ opacity: Math.min(1, Math.abs(dx) / 90) }">
    <span v-if="dx > 0">↗ Move to…</span><span v-else>Delete 🗑</span>
  </div>
  <div
    class="note-item"
    :class="{ active, done: note.done }"
    :style="dx ? { transform: `translateX(${dx}px)` } : undefined"
    role="button"
    tabindex="0"
    draggable="true"
    @click="onClick"
    @keydown.enter="emit('open')"
    @dragstart="onDragStart"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
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
  </div>
</template>
