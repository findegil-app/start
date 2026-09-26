import { createRouter, createWebHashHistory } from 'vue-router'
import { credentials, session } from './stores/auth'

// Hash history: GitHub Pages no tiene fallback SPA y así cualquier URL funciona offline.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
    {
      path: '/',
      component: () => import('./views/NotesView.vue'),
      children: [
        { path: '', name: 'home', component: { render: () => null } },
        { path: 'note/:id', name: 'note', component: () => import('./views/NoteView.vue') },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

// Para entrar hacen falta identidad (Google) y acceso al repo (token de GitHub en el dispositivo).
router.beforeEach((to) => {
  const ready = !!session.value && !!credentials.value
  if (!ready && to.name !== 'login') return { name: 'login' }
  if (ready && to.name === 'login') return { name: 'home' }
})
