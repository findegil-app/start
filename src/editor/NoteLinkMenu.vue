<script setup lang="ts">
import { ref, watch } from 'vue'
import type { NoteLinkItem } from './extensions/NoteLink'

const props = defineProps<{ items: NoteLinkItem[]; command: (item: NoteLinkItem) => void; query?: string }>()
const index = ref(0)
watch(
  () => props.items,
  () => (index.value = 0),
)

function onKeyDown(e: KeyboardEvent): boolean {
  if (!props.items.length) return false
  if (e.key === 'ArrowDown') index.value = (index.value + 1) % props.items.length
  else if (e.key === 'ArrowUp') index.value = (index.value - 1 + props.items.length) % props.items.length
  else if (e.key === 'Enter' || e.key === 'Tab') props.command(props.items[index.value])
  else return false
  return true
}
defineExpose({ onKeyDown })
</script>

<template>
  <div class="slash-menu" role="listbox">
    <div class="slash-group">Link to note</div>
    <button
      v-for="(item, i) in items"
      :key="(item.create ? '+' : '') + item.title"
      type="button"
      class="slash-item"
      :class="{ on: i === index }"
      @mousemove="index = i"
      @mousedown.prevent
      @click="command(item)"
    >
      <span class="slash-icon">{{ item.create ? '＋' : '↗' }}</span>
      <span class="slash-text">
        <b>{{ item.create ? `Create “${item.title}”` : item.title }}</b>
        <small>{{ item.create ? 'New note in Landing Zone' : item.where }}</small>
      </span>
    </button>
    <p v-if="!items.length" class="slash-empty">Type a note title…</p>
  </div>
</template>
