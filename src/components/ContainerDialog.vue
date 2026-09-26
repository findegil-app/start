<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { KIND_LABEL } from '../lib/para'
import { createContainer, ui, updateContainer } from '../stores/containers'

const name = ref('')
const deadline = ref('')
const input = ref<HTMLInputElement>()
const d = computed(() => ui.containerDialog)
const editing = computed(() => !!d.value?.id)

watch(d, async (v) => {
  name.value = v?.name ?? ''
  deadline.value = ''
  if (v) {
    await nextTick()
    input.value?.focus()
    input.value?.select()
  }
})

function close() {
  ui.containerDialog = null
}

async function submit() {
  const v = d.value
  if (!v || !name.value.trim()) return
  if (v.id) {
    await updateContainer(v.id, { name: name.value.trim() })
    v.then?.(v.id)
  } else {
    const id = await createContainer(v.kind, name.value, v.kind === 'project' ? deadline.value || null : null)
    v.then?.(id)
  }
  close()
}

const help: Record<string, string> = {
  project: 'A short-term effort with a goal and a deadline. When it’s done, archive it.',
  area: 'An ongoing responsibility with a standard to maintain (health, finances, home…).',
  resource: 'A topic or interest that may be useful in the future.',
}
</script>

<template>
  <div v-if="d" class="overlay" @click.self="close">
    <form class="dialog" @submit.prevent="submit" @keydown.esc="close">
      <h3>{{ editing ? 'Rename' : 'New' }} {{ KIND_LABEL[d.kind].toLowerCase() }}</h3>
      <p v-if="!editing" class="muted small">{{ help[d.kind] }}</p>
      <label>
        Name
        <input ref="input" v-model="name" required maxlength="80" :placeholder="d.kind === 'project' ? 'e.g. Trip to Lisbon' : d.kind === 'area' ? 'e.g. Health' : 'e.g. Recipes'" />
      </label>
      <label v-if="d.kind === 'project' && !editing">
        Deadline <span class="muted small">(recommended)</span>
        <input v-model="deadline" type="date" />
      </label>
      <div class="dialog-actions">
        <button type="button" class="ghost" @click="close">Cancel</button>
        <button type="submit" class="primary">{{ editing ? 'Save' : 'Create' }}</button>
      </div>
    </form>
  </div>
</template>
