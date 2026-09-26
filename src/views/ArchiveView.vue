<script setup lang="ts">
import { computed } from 'vue'
import { KIND_PLURAL } from '../lib/para'
import { restoreContainer, useContainers } from '../stores/containers'
import { useCounts } from '../stores/notes'

const emit = defineEmits<{ menu: [] }>()
const containers = useContainers()
const counts = useCounts()
const groups = computed(() =>
  (['project', 'area', 'resource'] as const).map((kind) => ({ kind, items: (containers.value?.archived ?? []).filter((c) => c.kind === kind) })),
)
</script>

<template>
  <div class="section archive-view">
    <section class="list-pane wide">
      <header class="list-head">
        <div class="list-title">
          <button type="button" class="icon-btn menu-btn" aria-label="Menu" @click="emit('menu')">☰</button>
          <div>
            <div class="kicker">Inactive</div>
            <h2>Archive</h2>
          </div>
        </div>
        <p class="hint">Completed projects and areas or resources you no longer maintain. Nothing is lost: restore them anytime.</p>
      </header>
      <div class="archive-groups">
        <section v-for="g in groups" :key="g.kind">
          <h3 class="nav-label">{{ KIND_PLURAL[g.kind] }}</h3>
          <RouterLink v-for="c in g.items" :key="c.id" :to="{ name: 'container', params: { cid: c.id } }" class="archive-row">
            <span class="name">{{ c.name }}</span>
            <span class="muted small">{{ counts?.byContainer.get(c.id) ?? 0 }} notes</span>
            <button type="button" class="ghost small" @click.prevent="restoreContainer(c.id)">Restore</button>
          </RouterLink>
          <p v-if="!g.items.length" class="nav-empty">Nothing archived</p>
        </section>
      </div>
    </section>
  </div>
</template>
