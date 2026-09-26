import { reactive } from 'vue'

export interface ToastAction {
  label: string
  run: () => void
}

export interface Toast {
  id: number
  message: string
  actions: ToastAction[]
}

export const toasts = reactive<Toast[]>([])
let seq = 0

export function showToast(message: string, action?: ToastAction | ToastAction[], ms = 6000) {
  const toast: Toast = { id: ++seq, message, actions: action ? (Array.isArray(action) ? action : [action]) : [] }
  toasts.push(toast)
  setTimeout(() => dismissToast(toast.id), ms)
  return toast.id
}

export function dismissToast(id: number) {
  const i = toasts.findIndex((t) => t.id === id)
  if (i >= 0) toasts.splice(i, 1)
}
