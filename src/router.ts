import { createRouter, createWebHashHistory } from 'vue-router'
import { credentials, session } from './stores/auth'

// Hash history: GitHub Pages no tiene fallback SPA y así cualquier URL funciona offline.
// La nota abierta va en la query (?n=<id>) para que cada sección tenga su lista + editor.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
    {
      path: '/',
      component: () => import('./views/LibraryView.vue'),
      children: [
        { path: '', redirect: { name: 'inbox' } },
        { path: 'inbox', name: 'inbox', component: () => import('./views/SectionView.vue') },
        { path: 'scratch', name: 'scratch', component: () => import('./views/SectionView.vue') },
        { path: 'c/:cid', name: 'container', component: () => import('./views/SectionView.vue') },
        { path: 'archive', name: 'archive', component: () => import('./views/ArchiveView.vue') },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

// Para entrar hacen falta identidad (Google) y acceso al repo.
router.beforeEach((to) => {
  const ready = !!session.value && !!credentials.value
  if (!ready && to.name !== 'login') return { name: 'login' }
  if (ready && to.name === 'login') return { name: 'inbox' }
})
