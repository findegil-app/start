import { describe, expect, it } from 'vitest'
import { parseNote, serializeNote } from './frontmatter'

const note = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  title: 'Reunión de proyecto: "fase 2"',
  content: '# Contenido de la nota\n\nTexto con **negrita**.',
  tags: ['trabajo', 'frontend'],
  createdAt: '2026-09-26T08:11:00Z',
  updatedAt: '2026-09-26T09:00:00Z',
}

describe('frontmatter', () => {
  it('serializa con el formato del documento de arquitectura', () => {
    const md = serializeNote(note)
    expect(md).toMatch(/^---\nid: 123e4567-e89b-12d3-a456-426614174000\n/)
    expect(md).toContain('date: 2026-09-26T08:11:00Z\n')
    expect(md).toContain('tags: [trabajo, frontend]\n')
    expect(md).toMatch(/---\n\n# Contenido de la nota\n\nTexto con \*\*negrita\*\*\.\n$/)
  })

  it('round-trip preserva campos y claves desconocidas', () => {
    const withExtra = { ...note, extra: { pinned: true, source: 'web' } }
    expect(parseNote(note.id, serializeNote(withExtra))).toEqual(withExtra)
  })

  it('tolera archivos sin frontmatter (creados a mano en el repo)', () => {
    const parsed = parseNote('abc', '# Mi idea\n\nalgo')
    expect(parsed.title).toBe('Mi idea')
    expect(parsed.content).toBe('# Mi idea\n\nalgo')
    expect(parsed.tags).toEqual([])
  })

  it('acepta tags como string separado por comas', () => {
    expect(parseNote('x', '---\ntags: a, b ,a\n---\nhola').tags).toEqual(['a', 'b'])
  })
})
