import { ref, watch } from 'vue'

const KEY = 'findegil-focus'

function read() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Modo enfoque (escritorio): oculta el listado de notas y deja solo la barra lateral y la nota. */
export const focusMode = ref(read())

watch(focusMode, (on) => {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* sin almacenamiento: solo dura la sesión */
  }
})

export const toggleFocus = () => (focusMode.value = !focusMode.value)
