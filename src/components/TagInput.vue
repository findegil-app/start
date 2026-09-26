<script setup lang="ts">
import { ref } from 'vue'

const tags = defineModel<string[]>({ required: true })
const draft = ref('')

function commit() {
  const parts = draft.value.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean)
  draft.value = ''
  const next = [...new Set([...tags.value, ...parts])]
  if (next.length !== tags.value.length) tags.value = next
}

function remove(tag: string) {
  tags.value = tags.value.filter((t) => t !== tag)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    commit()
  } else if (e.key === 'Backspace' && !draft.value && tags.value.length) {
    tags.value = tags.value.slice(0, -1)
  }
}
</script>

<template>
  <div class="tag-input">
    <span v-for="tag in tags" :key="tag" class="tag">
      #{{ tag }}
      <button type="button" :aria-label="`Remove tag ${tag}`" @click="remove(tag)">×</button>
    </span>
    <input v-model="draft" placeholder="Add tag…" enterkeyhint="done" @keydown="onKey" @blur="commit" />
  </div>
</template>
