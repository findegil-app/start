import YAML from 'yaml'
import type { Note } from '../db'
import { titleFromPath } from './paths'

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
const KNOWN = new Set(['id', 'title', 'date', 'updated', 'tags'])

export type ParsedNote = Pick<Note, 'id' | 'title' | 'content' | 'tags' | 'createdAt' | 'updatedAt' | 'extra'>

/** Serializa una nota como Markdown con YAML frontmatter (formato del Repo 2). */
export function serializeNote(note: ParsedNote): string {
  const data: Record<string, unknown> = {
    id: note.id,
    title: note.title,
    date: note.createdAt,
    updated: note.updatedAt,
    tags: note.tags,
    ...note.extra,
  }
  const doc = new YAML.Document(data)
  const tags = doc.get('tags', true)
  if (YAML.isSeq(tags)) tags.flow = true
  const fm = doc.toString({ lineWidth: 0, flowCollectionPadding: false })
  const body = note.content.replace(/^\s*\n/, '').replace(/\s+$/, '')
  return `---\n${fm}---\n\n${body}\n`
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

/**
 * Parsea un archivo .md del repo. El `id` viene del frontmatter; si falta (archivo creado a mano)
 * se genera uno nuevo y `hasId` es false para que el sync lo escriba de vuelta.
 */
export function parseNote(text: string, path: string): ParsedNote & { hasId: boolean } {
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
  body = body.replace(/^\s*\n/, '').replace(/\s+$/, '')

  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim()
  const title =
    typeof data.title === 'string' || typeof data.title === 'number' ? String(data.title) : (heading ?? titleFromPath(path))
  const hasId = typeof data.id === 'string' && data.id.trim() !== ''
  const id = hasId ? String(data.id).trim() : crypto.randomUUID()
  const createdAt = asIsoString(data.date) ?? new Date().toISOString()
  const updatedAt = asIsoString(data.updated) ?? createdAt

  const extra: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) if (!KNOWN.has(k)) extra[k] = v

  return {
    id,
    hasId,
    title,
    content: body,
    tags: normalizeTags(data.tags),
    createdAt,
    updatedAt,
    extra: Object.keys(extra).length ? extra : undefined,
  }
}
