<script setup lang="ts">
import { computed, ref } from 'vue'
import AgendaRow from '../components/AgendaRow.vue'
import { parseLocal, toLocalDate } from '../lib/dates'
import { groupAgenda, useAgenda, type AgendaItem } from '../stores/agenda'

const emit = defineEmits<{ menu: [] }>()
const agenda = useAgenda()
const groups = computed(() => groupAgenda(agenda.value ?? []))
const view = ref<'agenda' | 'month'>(window.matchMedia('(min-width: 761px)').matches ? 'month' : 'agenda')

// ---- Mes
const cursor = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
const selected = ref(toLocalDate(new Date()))
const monthLabel = computed(() => cursor.value.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }))
const byDay = computed(() => {
  const map = new Map<string, AgendaItem[]>()
  for (const it of agenda.value ?? []) {
    const d = it.due.slice(0, 10)
    map.set(d, [...(map.get(d) ?? []), it])
  }
  return map
})
const days = computed(() => {
  const first = cursor.value
  const offset = (first.getDay() + 6) % 7 // lunes primero
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const key = toLocalDate(d)
    return { key, day: d.getDate(), inMonth: d.getMonth() === first.getMonth(), items: byDay.value.get(key) ?? [] }
  })
})
const today = toLocalDate(new Date())
const shift = (n: number) => (cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + n, 1))
function goToday() {
  cursor.value = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  selected.value = today
}
const selectedItems = computed(() => byDay.value.get(selected.value) ?? [])
const selectedLabel = computed(() => parseLocal(selected.value).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))
</script>

<template>
  <div class="section agenda-view">
    <section class="list-pane wide agenda-pane">
      <header class="list-head">
        <div class="list-title">
          <button type="button" class="icon-btn menu-btn" aria-label="Menu" @click="emit('menu')">☰</button>
          <div>
            <div class="kicker">Due dates & reminders</div>
            <h2>{{ view === 'month' ? monthLabel : 'Agenda' }}</h2>
          </div>
          <div class="seg">
            <button type="button" :class="{ on: view === 'agenda' }" @click="view = 'agenda'">Agenda</button>
            <button type="button" :class="{ on: view === 'month' }" @click="view = 'month'">Month</button>
          </div>
        </div>
        <div v-if="view === 'month'" class="month-nav">
          <button type="button" class="ghost small" @click="shift(-1)">‹</button>
          <button type="button" class="ghost small" @click="goToday">Today</button>
          <button type="button" class="ghost small" @click="shift(1)">›</button>
        </div>
      </header>

      <div v-if="view === 'agenda'" class="agenda-list">
        <section v-for="g in groups" :key="g.label" class="agenda-group">
          <h3 class="nav-label" :class="g.tone">{{ g.label }}</h3>
          <AgendaRow v-for="it in g.items" :key="it.key" :item="it" />
        </section>
        <p v-if="agenda && !groups.length" class="empty muted">Nothing due. Add a due date to any note to see it here.</p>
      </div>

      <div v-else class="month-wrap">
        <div class="month">
          <div v-for="d in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']" :key="d" class="dow">{{ d }}</div>
          <button
            v-for="d in days"
            :key="d.key"
            type="button"
            class="day"
            :class="{ out: !d.inMonth, today: d.key === today, sel: d.key === selected }"
            @click="selected = d.key"
          >
            <span class="num">{{ d.day }}</span>
            <span
              v-for="it in d.items.slice(0, 3)"
              :key="it.key"
              class="ev"
              :class="[it.kind, { done: it.done, overdue: !it.done && it.due < today }]"
            >
              {{ it.kind === 'project' ? '▲ ' : it.due.length > 10 ? `${it.due.slice(11, 16)} ` : '' }}{{ it.title }}
            </span>
            <span v-if="d.items.length > 3" class="more">+{{ d.items.length - 3 }} more</span>
          </button>
        </div>
        <aside class="day-panel">
          <h3>{{ selectedLabel }}</h3>
          <AgendaRow v-for="it in selectedItems" :key="it.key" :item="it" compact />
          <p v-if="!selectedItems.length" class="muted small">Nothing on this day.</p>
          <h3 class="upcoming-title">Upcoming</h3>
          <template v-for="g in groups.slice(0, 3)" :key="g.label">
            <div class="nav-label" :class="g.tone">{{ g.label }}</div>
            <AgendaRow v-for="it in g.items.slice(0, 5)" :key="it.key" :item="it" />
          </template>
        </aside>
      </div>
    </section>
  </div>
</template>
