<script setup lang="ts">
import { ref, watch } from 'vue'
import type { BlockItem } from './blocks'

const props = defineProps<{ items: BlockItem[]; command: (item: BlockItem) => void }>()
const index = ref(0)
const list = ref<HTMLElement>()

watch(
  () => props.items,
  () => (index.value = 0),
)
watch(index, (i) => list.value?.children[i]?.scrollIntoView({ block: 'nearest' }))

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
    <div ref="list">
      <button
        v-for="(item, i) in items"
        :key="item.title"
        type="button"
        class="slash-item"
        :class="{ on: i === index }"
        role="option"
        :aria-selected="i === index"
        @mousemove="index = i"
        @mousedown.prevent
        @click="command(item)"
      >
        <span class="slash-icon">{{ item.icon }}</span>
        <span class="slash-text"><b>{{ item.title }}</b><small>{{ item.hint }}</small></span>
      </button>
    </div>
    <p v-if="!items.length" class="slash-empty">No matching blocks</p>
  </div>
</template>
