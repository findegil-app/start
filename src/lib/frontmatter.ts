import YAML from 'yaml'
import type { Container, ContainerKind, Note } from '../db'
import { titleFromPath } from './paths'

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

export type ParsedNote = Pick<Note, 'id' | 'title' | 'content' | 'tags' | 'createdAt' | 'updatedAt' | 'extra'> &
  Partial<Pick<Note, 'due' | 'remind' | 'done'>>

export type ParsedContainer = Pick<Container, 'id' | 'name' | 'deadline' | 'description' | 'createdAt' | 'updatedAt' | 'extra'>

function stringify(data: Record<string, unknown>, body: string): string {
  const doc = new YAML.Document(data)
  const tags = doc.get('tags', true)
  if (YAML.isSeq(tags)) tags.flow = true
  const fm = doc.toString({ lineWidth: 0, flowCollectionPadding: false })
  const clean = body.replace(/^\s*\n/, '').replace(/\s+$/, '')
  return `---\n${fm}---\n\n${clean}\n`
}

function split(text: string): { data: Record<string, unknown>; body: string } {
  let data: Record<string, unknown> = {}
  let body = text
  const m = FM_RE.exec(text)
  if (m) {
    try {
      const parsed = YAML.parse(m[1])
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed
      body = text.slice(m[0].length)
    } catch {
      // Frontmatter inválido: se trata todo el archivo como cuerpo.
    }
  }
  return { data, body: body.replace(/^\s*\n/, '').replace(/\s+$/, '') }
}

function extraOf(data: Record<string, unknown>, known: Set<string>) {
  const extra: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) if (!known.has(k)) extra[k] = v
  return Object.keys(extra).length ? extra : undefined
}

function normalizeTags(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : []
  return [...new Set(list.map((t) => String(t).trim()).filter(Boolean))]
}

function asIsoString(raw: unknown): string | undefined {
  if (raw instanceof Date) return raw.toISOString()
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return undefined
}

// ---------------------------------------------------------------- notas

const NOTE_KEYS = new Set(['id', 'title', 'date', 'updated', 'tags', 'due', 'remind', 'done'])

/** Serializa una nota como Markdown con YAML frontmatter. Los campos de tiempo solo aparecen si tienen valor. */
export function serializeNote(note: ParsedNote): string {
  const data: Record<string, unknown> = {
    id: note.id,
    title: note.title,
    date: note.createdAt,
    updated: note.updatedAt,
    tags: note.tags,
  }
  if (note.due) data.due = note.due
  if (note.remind) data.remind = note.remind
  if (note.done) data.done = true
  return stringify({ ...data, ...note.extra }, note.content)
}

/**
 * Parsea un archivo .md del repo. El `id` viene del frontmatter; si falta (archivo creado a mano)
 * se genera uno nuevo y `hasId` es false para que el sync lo escriba de vuelta.
 */
export function parseNote(text: string, path: string): ParsedNote & { hasId: boolean } {
  const { data, body } = split(text)
  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim()
  const title =
    typeof data.title === 'string' || typeof data.title === 'number' ? String(data.title) : (heading ?? titleFromPath(path))
  const hasId = typeof data.id === 'string' && data.id.trim() !== ''
  const id = hasId ? String(data.id).trim() : crypto.randomUUID()
  const createdAt = asIsoString(data.date) ?? new Date().toISOString()
  const updatedAt = asIsoString(data.updated) ?? createdAt
  return {
    id,
    hasId,
    title,
    content: body,
    tags: normalizeTags(data.tags),
    createdAt,
    updatedAt,
    due: asIsoString(data.due) ?? null,
    remind: asIsoString(data.remind) ?? null,
    done: data.done === true,
    extra: extraOf(data, NOTE_KEYS),
  }
}

// ---------------------------------------------------------------- contenedores

const CONTAINER_KEYS = new Set(['id', 'type', 'name', 'deadline', 'created', 'updated', 'status'])

/** _project.md / _area.md / _resource.md: metadatos del contenedor; el cuerpo es la descripción. */
export function serializeContainer(c: ParsedContainer & { kind: ContainerKind; status: Container['status'] }): string {
  const data: Record<string, unknown> = { id: c.id, type: c.kind, name: c.name, status: c.status }
  if (c.deadline) data.deadline = c.deadline
  data.created = c.createdAt
  data.updated = c.updatedAt
  return stringify({ ...data, ...c.extra }, c.description)
}

export function parseContainer(text: string, folderName: string): ParsedContainer & { hasId: boolean } {
  const { data, body } = split(text)
  const hasId = typeof data.id === 'string' && data.id.trim() !== ''
  const createdAt = asIsoString(data.created) ?? new Date().toISOString()
  return {
    id: hasId ? String(data.id).trim() : crypto.randomUUID(),
    hasId,
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : folderName,
    deadline: asIsoString(data.deadline) ?? null,
    description: body,
    createdAt,
    updatedAt: asIsoString(data.updated) ?? createdAt,
    extra: extraOf(data, CONTAINER_KEYS),
  }
}
