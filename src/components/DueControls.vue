<script setup lang="ts">
import { computed } from 'vue'
import type { Note } from '../db'
import { dueTone, formatDate, hasTime, REMINDER_PRESETS, reminderPreset, remindFor, toLocalDateTime } from '../lib/dates'
import { updateNote } from '../stores/notes'

const props = defineProps<{ note: Note }>()

const dueDate = computed(() => props.note.due?.slice(0, 10) ?? '')
const dueTime = computed(() => (props.note.due && hasTime(props.note.due) ? props.note.due.slice(11, 16) : ''))
const preset = computed(() => reminderPreset(props.note.due, props.note.remind))
const tone = computed(() => (props.note.due ? dueTone(props.note.due, props.note.done) : null))

/** Al cambiar la fecha límite, el aviso conserva su antelación. */
function setDue(date: string, time: string) {
  const due = date ? (time ? `${date}T${time}` : date) : null
  const p = preset.value
  const remind = due && typeof p === 'number' ? remindFor(due, p) : p === 'custom' ? props.note.remind : null
  void updateNote(props.note.id, { due, remind, done: due ? props.note.done : false })
}

function onPreset(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  let remind: string | null = null
  if (v === 'custom') remind = props.note.remind ?? (props.note.due ? remindFor(props.note.due, 0) : null)
  else if (v !== '' && props.note.due) remind = remindFor(props.note.due, Number(v))
  if (v === 'custom' && !remind) {
    const d = new Date(Date.now() + 3_600_000)
    d.setMinutes(0)
    remind = toLocalDateTime(d)
  }
  void updateNote(props.note.id, { remind })
}
</script>

<template>
  <div class="due-controls">
    <label class="chip due-chip" :class="[tone, { out: !note.due }]" title="Due date">
      📅 {{ note.due ? `Due ${formatDate(note.due, false)}` : 'Add due date' }}
      <input type="date" :value="dueDate" aria-label="Due date" @change="setDue(($event.target as HTMLInputElement).value, dueTime)" />
    </label>
    <label v-if="note.due" class="chip out" title="Due time (optional)">
      🕘 {{ dueTime || 'All day' }}
      <input type="time" :value="dueTime" aria-label="Due time" @change="setDue(dueDate, ($event.target as HTMLInputElement).value)" />
    </label>

    <span class="chip out select-chip" :class="{ on: note.remind }">
      🔔
      <select :value="preset === null ? '' : String(preset)" aria-label="Reminder" @change="onPreset">
        <option value="">No reminder</option>
        <option v-for="p in REMINDER_PRESETS" :key="p.minutes" :value="String(p.minutes)" :disabled="!note.due">{{ p.label }}</option>
        <option value="custom">Custom…</option>
      </select>
    </span>
    <label v-if="preset === 'custom'" class="chip out" title="Reminder time">
      {{ note.remind ? formatDate(note.remind) : 'Pick time' }}
      <input
        type="datetime-local"
        :value="note.remind ?? ''"
        aria-label="Reminder time"
        @change="updateNote(note.id, { remind: ($event.target as HTMLInputElement).value || null })"
      />
    </label>

    <button v-if="note.due" type="button" class="chip" :class="note.done ? 'done' : 'out'" @click="updateNote(note.id, { done: !note.done })">
      {{ note.done ? '✓ Done' : '○ Mark done' }}
    </button>
    <button v-if="note.due" type="button" class="chip out clear" title="Remove due date" @click="updateNote(note.id, { due: null, remind: null, done: false })">✕</button>
  </div>
</template>
