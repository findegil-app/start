import { ref, watch } from 'vue'

export type ThemeMode = 'system' | 'light' | 'dark'

const KEY = 'findegil-theme'
const COLORS = { light: '#f6f1e7', dark: '#0f1220' }

function read(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

/** Preferencia de tema de este dispositivo (se aplica también antes de montar, desde index.html). */
export const themeMode = ref<ThemeMode>(read())

const media = window.matchMedia('(prefers-color-scheme: dark)')

function apply() {
  const mode = themeMode.value
  const root = document.documentElement
  if (mode === 'system') delete root.dataset.theme
  else root.dataset.theme = mode
  const dark = mode === 'dark' || (mode === 'system' && media.matches)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? COLORS.dark : COLORS.light)
}

watch(
  themeMode,
  (mode) => {
    try {
      if (mode === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, mode)
    } catch {
      // Almacenamiento no disponible: el tema solo dura esta sesión.
    }
    apply()
  },
  { immediate: true },
)
media.addEventListener('change', apply)

const ORDER: ThemeMode[] = ['system', 'light', 'dark']
export const cycleTheme = () => (themeMode.value = ORDER[(ORDER.indexOf(themeMode.value) + 1) % ORDER.length])
export const THEME_LABEL: Record<ThemeMode, string> = { system: 'Tema: sistema', light: 'Tema: claro', dark: 'Tema: oscuro' }
