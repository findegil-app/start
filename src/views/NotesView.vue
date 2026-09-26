<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SyncIndicator from '../components/SyncIndicator.vue'
import { credentials, logout } from '../stores/auth'
import { createNote, useNoteList } from '../stores/notes'

const route = useRoute()
const router = useRouter()
const logo = `${import.meta.env.BASE_URL}logo.svg`
const search = ref('')
const notes = useNoteList(search)
const activeId = computed(() => route.params.id as string | undefined)

async function newNote() {
  const id = await createNote()
  await router.push({ name: 'note', params: { id }, query: { new: '1' } })
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

async function signOut() {
  if (!confirm('¿Cerrar sesión? Se borrará el token de este dispositivo. Las notas locales se conservan.')) return
  await logout()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <div class="shell" :class="{ 'has-note': activeId }">
    <aside class="sidebar">
      <header class="sidebar-header">
        <div class="brand">
          <img :src="logo" alt="" width="24" height="24" />
          <span>Findegil</span>
        </div>
        <button type="button" class="icon-btn" title="Cerrar sesión" aria-label="Cerrar sesión" @click="signOut">⎋</button>
      </header>
      <div class="sidebar-tools">
        <input v-model="search" type="search" placeholder="Buscar… (#etiqueta)" aria-label="Buscar notas" />
        <button type="button" class="primary" title="Nueva nota" @click="newNote">＋ Nueva</button>
      </div>
      <nav class="note-list" aria-label="Notas">
        <RouterLink
          v-for="n in notes"
          :key="n.id"
          :to="{ name: 'note', params: { id: n.id } }"
          class="note-item"
          :class="{ active: n.id === activeId }"
        >
          <div class="note-item-head">
            <strong>{{ n.title || 'Sin título' }}</strong>
            <span v-if="n.syncStatus === 'pending'" class="pending-dot" title="Pendiente de sincronizar" />
          </div>
          <p v-if="n.excerpt" class="excerpt">{{ n.excerpt }}</p>
          <div class="note-item-meta">
            <time :datetime="n.updatedAt">{{ formatDate(n.updatedAt) }}</time>
            <span v-for="t in n.tags.slice(0, 3)" :key="t" class="tag small">#{{ t }}</span>
          </div>
        </RouterLink>
        <p v-if="notes && !notes.length" class="empty muted">
          {{ search ? 'Sin resultados.' : 'Aún no hay notas. Crea la primera.' }}
        </p>
      </nav>
      <footer class="sidebar-footer">
        <SyncIndicator />
        <span class="muted repo" :title="credentials ? `${credentials.owner}/${credentials.repo}` : ''">
          {{ credentials?.owner }}/{{ credentials?.repo }}
        </span>
      </footer>
    </aside>
    <main class="content">
      <RouterView v-slot="{ Component }">
        <component :is="Component" v-if="Component" />
        <div v-else class="placeholder muted">
          <p>Selecciona una nota o crea una nueva.</p>
        </div>
      </RouterView>
    </main>
  </div>
</template>
