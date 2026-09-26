<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { db } from '../db'
import { formatDate, REMINDER_PRESETS, remindFor } from '../lib/dates'
import { openMove } from '../stores/containers'
import { locationLabel, routeForNote } from '../stores/noteLinks'
import { createNote, useLiveQuery } from '../stores/notes'
import { showToast } from '../stores/toast'
import { requestNotificationPermission } from '../notifications/reminders'

const router = useRouter()
const logo = `${import.meta.env.BASE_URL}logo.svg`
const title = ref('')
const body = ref('')
const dueDate = ref('')
const dueTime = ref('')
const remindPreset = ref<string>('')
const checklist = ref(false)
const scratch = ref(false)
const classify = ref(false)
const bodyInput = ref<HTMLTextAreaElement>()

const due = computed(() => (dueDate.value ? (dueTime.value ? `${dueDate.value}T${dueTime.value}` : dueDate.value) : null))
const canSave = computed(() => !!(title.value.trim() || body.value.trim()))
const destination = computed(() => (scratch.value ? 'Scratch' : 'Landing Zone'))

const recent = useLiveQuery(async () => {
  const notes = await db.notes.orderBy('updatedAt').reverse().filter((n) => n.syncStatus !== 'deleted').limit(5).toArray()
  return Promise.all(notes.map(async (n) => ({ id: n.id, title: n.title || 'Untitled', where: await locationLabel(n), route: routeForNote(n) })))
})

function reset() {
  title.value = ''
  body.value = ''
  dueDate.value = ''
  dueTime.value = ''
  remindPreset.value = ''
  checklist.value = false
  scratch.value = false
  classify.value = false
  void nextTick(() => bodyInput.value?.focus())
}

async function save() {
  if (!canSave.value) return
  let text = body.value.replace(/\s+$/, '')
  let noteTitle = title.value.trim()
  if (!noteTitle) {
    // Sin título: la primera línea hace de título.
    const [first, ...rest] = text.split('\n')
    noteTitle = first.trim().slice(0, 80)
    text = rest.join('\n').trim()
  }
  if (checklist.value) {
    text = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => `- [ ] ${l.replace(/^[-*]\s+(\[[ xX]\]\s*)?/, '')}`)
      .join('\n')
  }
  const d = due.value
  const remind = d && remindPreset.value !== '' ? remindFor(d, Number(remindPreset.value)) : null
  const bucket = scratch.value ? 'scratch' : 'inbox'
  const id = await createNote({ bucket }, { title: noteTitle, content: text, due: d, remind })
  const wantsClassify = classify.value
  const dest = destination.value
  reset()
  if (wantsClassify) openMove(id)
  else showToast(`Saved to ${dest}`, { label: 'Open', run: () => void router.push(routeForNote({ id, bucket, containerId: null })) }, 3500)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    void save()
  }
}

onMounted(() => bodyInput.value?.focus())
</script>

<template>
  <div class="capture-view" @keydown="onKey">
    <header class="capture-head">
      <img :src="logo" alt="" width="28" height="28" />
      <h2>Capture</h2>
      <span class="muted small dest">→ {{ destination }}</span>
    </header>

    <div class="capture-card">
      <input v-model="title" class="capture-title" placeholder="Title (optional)" aria-label="Title" enterkeyhint="next" @keydown.enter.prevent="bodyInput?.focus()" />
      <textarea ref="bodyInput" v-model="body" class="capture-body" :placeholder="checklist ? 'One item per line…' : 'What\'s on your mind?'" aria-label="Note" />
    </div>

    <div class="capture-chips">
      <label class="chip" :class="due ? '' : 'out'">
        📅 {{ due ? formatDate(due) : 'Due' }}
        <input v-model="dueDate" type="date" aria-label="Due date" />
      </label>
      <label v-if="dueDate" class="chip out">
        🕘 {{ dueTime || 'All day' }}
        <input v-model="dueTime" type="time" aria-label="Due time" />
      </label>
      <span v-if="dueDate" class="chip out select-chip" :class="{ on: remindPreset !== '' }">
        🔔
        <select v-model="remindPreset" aria-label="Reminder" @change="remindPreset !== '' && requestNotificationPermission()">
          <option value="">No reminder</option>
          <option v-for="p in REMINDER_PRESETS" :key="p.minutes" :value="String(p.minutes)">{{ p.label }}</option>
        </select>
      </span>
      <button type="button" class="chip" :class="checklist ? '' : 'out'" @click="checklist = !checklist">☑ Checklist</button>
      <button type="button" class="chip" :class="scratch ? '' : 'out'" @click="scratch = !scratch">✎ Scratch</button>
      <button type="button" class="chip" :class="classify ? '' : 'out'" @click="classify = !classify">↗ Move to…</button>
    </div>

    <div class="capture-actions">
      <button type="button" class="ghost" :disabled="!canSave" @click="reset">Discard</button>
      <button type="button" class="primary" :disabled="!canSave" @click="save">Save to {{ destination }}</button>
    </div>

    <section v-if="recent?.length" class="capture-recent">
      <h3 class="nav-label">Recent</h3>
      <RouterLink v-for="r in recent" :key="r.id" :to="r.route" class="recent-row">
        <b>{{ r.title }}</b><small>{{ r.where }}</small>
      </RouterLink>
    </section>
  </div>
</template>
