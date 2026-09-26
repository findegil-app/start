/**
 * Fechas "locales" sin zona: 'YYYY-MM-DD' (todo el día) o 'YYYY-MM-DDTHH:mm'.
 * La app es monousuario: se interpretan siempre en la hora local del dispositivo.
 */
export const hasTime = (d: string) => d.length > 10

const pad = (n: number) => String(n).padStart(2, '0')
export const toLocalDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const toLocalDateTime = (d: Date) => `${toLocalDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`

/** Hora por defecto de los avisos de tareas "todo el día". */
export const ALL_DAY_HOUR = 9

export function parseLocal(d: string): Date {
  const [date, time] = d.split('T')
  const [y, m, day] = date.split('-').map(Number)
  const [h, min] = (time ?? '').split(':').map(Number)
  return new Date(y, m - 1, day, hasTime(d) ? h : 0, hasTime(d) ? min : 0)
}

/** Momento "efectivo" de la fecha límite: fin del día si no tiene hora. */
export function dueMoment(d: string): Date {
  const date = parseLocal(d)
  if (!hasTime(d)) date.setHours(23, 59, 59)
  return date
}

const DAY = 86_400_000
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export function formatDate(d: string, withTime = true): string {
  const date = parseLocal(d)
  const days = Math.round((startOfDay(date).getTime() - startOfDay(new Date()).getTime()) / DAY)
  const time = withTime && hasTime(d) ? ` ${pad(date.getHours())}:${pad(date.getMinutes())}` : ''
  if (days === 0) return `Today${time}`
  if (days === 1) return `Tomorrow${time}`
  if (days === -1) return `Yesterday${time}`
  const sameYear = date.getFullYear() === new Date().getFullYear()
  const label = date.toLocaleDateString('en-GB', { weekday: days > -7 && days < 7 ? 'short' : undefined, day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' })
  return `${label}${time}`
}

export type DueTone = 'overdue' | 'soon' | 'normal' | 'done'

export function dueTone(d: string, done = false): DueTone {
  if (done) return 'done'
  const ms = dueMoment(d).getTime() - Date.now()
  if (ms < 0) return 'overdue'
  if (ms < DAY) return 'soon'
  return 'normal'
}

/** Días hasta la fecha (redondeado hacia arriba); negativo si ya pasó. */
export function daysUntil(d: string): number {
  return Math.ceil((startOfDay(parseLocal(d)).getTime() - startOfDay(new Date()).getTime()) / DAY)
}

export const REMINDER_PRESETS = [
  { minutes: 0, label: 'At due time' },
  { minutes: 15, label: '15 min before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 1440, label: '1 day before' },
] as const

/** Momento del aviso para una fecha límite y una antelación. Las fechas sin hora avisan a las 9:00. */
export function remindFor(due: string, minutesBefore: number): string {
  const base = parseLocal(due)
  if (!hasTime(due)) base.setHours(ALL_DAY_HOUR, 0, 0)
  return toLocalDateTime(new Date(base.getTime() - minutesBefore * 60_000))
}

/** Qué preset corresponde a un aviso, o 'custom' si no coincide con ninguno. */
export function reminderPreset(due: string | null, remind: string | null): number | 'custom' | null {
  if (!remind) return null
  if (!due) return 'custom'
  const p = REMINDER_PRESETS.find((x) => remindFor(due, x.minutes) === remind)
  return p ? p.minutes : 'custom'
}
