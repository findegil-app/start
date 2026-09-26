import { db } from '../db'
import { dueMoment, parseLocal, toLocalDate } from '../lib/dates'
import { KIND_PLURAL } from '../lib/para'
import { routeForNote } from './noteLinks'
import { useLiveQuery } from './notes'

export interface AgendaItem {
  key: string
  kind: 'note' | 'project'
  id: string
  title: string
  /** 'YYYY-MM-DD' o 'YYYY-MM-DDTHH:mm' */
  due: string
  done: boolean
  remind: string | null
  where: string
  route: ReturnType<typeof routeForNote> | { name: 'container'; params: { cid: string } }
}

/** Notas con fecha límite (incluidas las hechas) y fechas de entrega de proyectos activos. */
export async function loadAgenda(): Promise<AgendaItem[]> {
  const [notes, containers] = await Promise.all([db.notes.where('due').above('').toArray(), db.containers.toArray()])
  const byId = new Map(containers.map((c) => [c.id, c]))
  const where = (bucket: string, cid: string | null) => {
    if (bucket === 'inbox') return 'Landing Zone'
    if (bucket === 'scratch') return 'Scratch'
    const c = cid ? byId.get(cid) : undefined
    return c ? `${KIND_PLURAL[c.kind]} › ${c.name}` : ''
  }
  const items: AgendaItem[] = notes
    .filter((n) => n.syncStatus !== 'deleted' && n.due)
    .map((n) => ({
      key: `n:${n.id}`,
      kind: 'note' as const,
      id: n.id,
      title: n.title || 'Untitled',
      due: n.due!,
      done: n.done,
      remind: n.remind,
      where: where(n.bucket, n.containerId),
      route: routeForNote(n),
    }))
  for (const c of containers) {
    if (c.kind !== 'project' || c.status !== 'active' || !c.deadline || c.syncStatus === 'deleted') continue
    items.push({
      key: `p:${c.id}`,
      kind: 'project',
      id: c.id,
      title: c.name,
      due: c.deadline,
      done: false,
      remind: null,
      where: 'Project deadline',
      route: { name: 'container', params: { cid: c.id } },
    })
  }
  return items.sort((a, b) => dueMoment(a.due).getTime() - dueMoment(b.due).getTime() || a.title.localeCompare(b.title))
}

export const useAgenda = () => useLiveQuery(loadAgenda)

export interface AgendaGroup {
  label: string
  tone?: 'overdue' | 'today'
  items: AgendaItem[]
}

/** Agrupa para la vista de agenda: vencidas, hoy, mañana, próximos 7 días (por día) y más adelante. */
export function groupAgenda(items: AgendaItem[], now = new Date()): AgendaGroup[] {
  const today = toLocalDate(now)
  const tomorrow = toLocalDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  const weekEnd = toLocalDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7))
  const groups: AgendaGroup[] = []
  const push = (label: string, item: AgendaItem, tone?: AgendaGroup['tone']) => {
    let g = groups.find((x) => x.label === label)
    if (!g) groups.push((g = { label, tone, items: [] }))
    g.items.push(item)
  }
  for (const it of items) {
    if (it.done) continue
    const day = it.due.slice(0, 10)
    if (dueMoment(it.due) < now && day !== today) push('Overdue', it, 'overdue')
    else if (day === today) push(`Today · ${parseLocal(day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}`, it, 'today')
    else if (day === tomorrow) push('Tomorrow', it)
    else if (day <= weekEnd) push(parseLocal(day).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }), it)
    else push('Later', it)
  }
  return groups
}
