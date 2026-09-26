import { liveQuery } from 'dexie'
import type { Router } from 'vue-router'
import { formatDate, hasTime, parseLocal, toLocalDateTime } from '../lib/dates'
import { isNative } from '../lib/platform'
import { loadAgenda } from '../stores/agenda'
import { updateNote } from '../stores/notes'
import { dismissToast, showToast } from '../stores/toast'

/** Un aviso concreto: el recordatorio de una nota o el momento en que vence. */
export interface Fire {
  key: string
  noteId: string
  title: string
  body: string
  at: Date
  route: unknown
}

export const SNOOZE_MINUTES = 10

async function computeFires(): Promise<Fire[]> {
  const fires: Fire[] = []
  for (const it of await loadAgenda()) {
    if (it.kind !== 'note' || it.done) continue
    if (it.remind) {
      fires.push({
        key: `r:${it.id}@${it.remind}`,
        noteId: it.id,
        title: it.title,
        body: `Due ${formatDate(it.due)}${it.where ? ` · ${it.where}` : ''}`,
        at: parseLocal(it.remind),
        route: it.route,
      })
    }
    // Además, aviso en el momento de vencer (si tiene hora y no coincide con el recordatorio).
    if (hasTime(it.due) && it.due !== it.remind) {
      fires.push({ key: `d:${it.id}@${it.due}`, noteId: it.id, title: it.title, body: `Due now${it.where ? ` · ${it.where}` : ''}`, at: parseLocal(it.due), route: it.route })
    }
  }
  return fires.sort((a, b) => a.at.getTime() - b.at.getTime())
}

export const snooze = (noteId: string) => updateNote(noteId, { remind: toLocalDateTime(new Date(Date.now() + SNOOZE_MINUTES * 60_000)) }, 2000)
export const markDone = (noteId: string) => updateNote(noteId, { done: true }, 2000)

/** Pide permiso de notificaciones (se llama al poner un aviso, con gesto del usuario). */
export async function requestNotificationPermission() {
  if (isNative) {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const p = await LocalNotifications.checkPermissions()
    if (p.display !== 'granted') await LocalNotifications.requestPermissions()
    return
  }
  if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission()
}

// ---------------------------------------------------------------- web

const NOTIFIED_KEY = 'findegil-notified'
const LOOKBACK_MS = 6 * 3_600_000

function readNotified(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}
function saveNotified(set: Set<string>) {
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...set].slice(-300)))
  } catch {
    // Sin almacenamiento: puede repetirse algún aviso tras recargar.
  }
}

/** Con la app abierta: aviso visible en la página y notificación del navegador a la hora indicada. */
function startWeb(router: Router) {
  const notified = readNotified()
  const tick = async () => {
    const now = Date.now()
    for (const f of await computeFires()) {
      const t = f.at.getTime()
      if (t > now || t < now - LOOKBACK_MS || notified.has(f.key)) continue
      notified.add(f.key)
      saveNotified(notified)
      const open = () => void router.push(f.route as never)
      const id = showToast(
        `🔔 ${f.title} — ${f.body}`,
        [
          { label: 'Open', run: open },
          { label: `Snooze ${SNOOZE_MINUTES} min`, run: () => void snooze(f.noteId) },
          { label: 'Done', run: () => void markDone(f.noteId) },
        ],
        5 * 60_000,
      )
      if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
        const n = new Notification(f.title, { body: f.body, tag: f.key, icon: `${import.meta.env.BASE_URL}pwa-192x192.png` })
        n.onclick = () => {
          window.focus()
          dismissToast(id)
          open()
          n.close()
        }
      }
    }
  }
  void tick()
  const timer = setInterval(() => void tick(), 20_000)
  return () => clearInterval(timer)
}

// ---------------------------------------------------------------- Android

/** Id numérico estable para cada aviso (LocalNotifications exige enteros de 32 bits). */
function notificationId(key: string) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0
  return Math.abs(h) || 1
}

/** Programa en Android todos los avisos futuros; se re-sincroniza cada vez que cambian las notas. */
async function startNative(router: Router) {
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  await LocalNotifications.registerActionTypes({
    types: [{ id: 'REMINDER', actions: [{ id: 'done', title: 'Done' }, { id: 'snooze', title: `Snooze ${SNOOZE_MINUTES} min` }] }],
  })
  await LocalNotifications.createChannel({
    id: 'reminders',
    name: 'Reminders',
    description: 'Due dates and reminders of your notes',
    importance: 5,
    visibility: 1,
    vibration: true,
  }).catch(() => {})

  const routes = new Map<string, unknown>()
  const actions = await LocalNotifications.addListener('localNotificationActionPerformed', ({ actionId, notification }) => {
    const noteId = notification.extra?.noteId as string | undefined
    if (!noteId) return
    if (actionId === 'done') void markDone(noteId)
    else if (actionId === 'snooze') void snooze(noteId)
    else {
      const route = routes.get(noteId)
      if (route) void router.push(route as never)
    }
  })

  let timer: ReturnType<typeof setTimeout> | undefined
  const reschedule = async () => {
    const now = Date.now()
    const fires = (await computeFires()).filter((f) => f.at.getTime() > now).slice(0, 60)
    for (const f of fires) routes.set(f.noteId, f.route)
    const pending = await LocalNotifications.getPending()
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) })
    if (!fires.length) return
    await LocalNotifications.schedule({
      notifications: fires.map((f) => ({
        id: notificationId(f.key),
        title: f.title,
        body: f.body,
        schedule: { at: f.at, allowWhileIdle: true },
        channelId: 'reminders',
        actionTypeId: 'REMINDER',
        smallIcon: 'ic_stat_findegil',
        iconColor: '#e3c27a',
        extra: { noteId: f.noteId },
      })),
    })
  }
  const sub = liveQuery(() => loadAgenda()).subscribe({
    next: () => {
      clearTimeout(timer)
      timer = setTimeout(() => void reschedule().catch((e) => console.warn('[findegil] reminders', e)), 1500)
    },
  })
  return () => {
    sub.unsubscribe()
    void actions.remove()
  }
}

export function startReminders(router: Router): () => void {
  if (!isNative) return startWeb(router)
  let stop = () => {}
  void startNative(router).then((s) => (stop = s))
  return () => stop()
}
