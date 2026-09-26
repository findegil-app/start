<script setup lang="ts">
import { useRouter } from 'vue-router'
import Sidebar from '../components/Sidebar.vue'

const router = useRouter()
</script>

<template>
  <!-- En móvil, la pestaña Library muestra la navegación PARA completa como página. -->
  <div class="library-home">
    <Sidebar class="as-page" @capture="router.push({ name: 'capture' })" />
  </div>
</template>
