<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ContainerDialog from '../components/ContainerDialog.vue'
import MovePalette from '../components/MovePalette.vue'
import Sidebar from '../components/Sidebar.vue'
import Toasts from '../components/Toasts.vue'
import { createNote } from '../stores/notes'

const route = useRoute()
const router = useRouter()
const drawer = ref(false)

async function capture() {
  const id = await createNote({ bucket: 'inbox' })
  drawer.value = false
  await router.push({ name: 'inbox', query: { n: id, new: '1' } })
}

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

function onKey(e: KeyboardEvent) {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || typing(e.target)) return
  if (e.key === 'n' || (e.altKey && e.key.toLowerCase() === 'n')) {
    e.preventDefault()
    void capture()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
watch(() => route.fullPath, () => (drawer.value = false))
</script>

<template>
  <div class="shell" :class="{ 'drawer-open': drawer }">
    <Sidebar @capture="capture" @navigate="drawer = false" />
    <div class="drawer-scrim" @click="drawer = false" />
    <RouterView v-slot="{ Component }">
      <component :is="Component" :key="(route.params.cid as string) ?? (route.name as string)" @menu="drawer = true" />
    </RouterView>
    <MovePalette />
    <ContainerDialog />
    <Toasts />
  </div>
</template>
