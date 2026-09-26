<script setup lang="ts">
import { computed } from 'vue'
import { dueTone, formatDate, hasTime } from '../lib/dates'
import type { AgendaItem } from '../stores/agenda'
import { updateNote } from '../stores/notes'

const props = defineProps<{ item: AgendaItem; compact?: boolean }>()
const tone = computed(() => dueTone(props.item.due, props.item.done))
</script>

<template>
  <div class="agenda-row" :class="[tone, item.kind]">
    <button
      v-if="item.kind === 'note'"
      type="button"
      class="check"
      :class="{ on: item.done }"
      :aria-label="item.done ? 'Mark as not done' : 'Mark as done'"
      @click="updateNote(item.id, { done: !item.done }, 2000)"
    >
      {{ item.done ? '✓' : '' }}
    </button>
    <span v-else class="flag" title="Project deadline">▲</span>
    <RouterLink :to="item.route" class="agenda-main">
      <b>{{ item.title }}</b>
      <small>{{ item.where }}</small>
    </RouterLink>
    <span class="chip small" :class="tone === 'normal' ? 'out' : tone">
      {{ compact && !hasTime(item.due) ? 'All day' : compact ? item.due.slice(11, 16) : formatDate(item.due) }}
    </span>
    <span v-if="item.remind && !item.done" class="bell" title="Reminder set">🔔</span>
  </div>
</template>
