// @vitest-environment happy-dom
import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { contentExtensions } from './extensions'

function roundTrip(md: string) {
  const editor = new Editor({ extensions: contentExtensions(), content: md, contentType: 'markdown' })
  const out = { json: editor.getJSON(), md: editor.getMarkdown() }
  editor.destroy()
  return out
}

const types = (json: { content?: { type?: string }[] }) => (json.content ?? []).map((n) => n.type)

describe('Markdown de los bloques tipo Notion', () => {
  it('callout ↔ alerta de GitHub', () => {
    const md = '> [!TIP]\n> Usa **PARA** para organizar.\n>\n> Segundo párrafo.'
    const { json, md: out } = roundTrip(md)
    expect(types(json)).toEqual(['callout'])
    expect(json.content![0].attrs).toMatchObject({ type: 'tip' })
    expect(out.trim()).toBe(md)
  })

  it('una cita normal sigue siendo cita', () => {
    expect(types(roundTrip('> Solo una cita').json)).toEqual(['blockquote'])
  })

  it('toggle ↔ <details>', () => {
    const md = '<details>\n<summary>Ver **detalles**</summary>\n\nContenido oculto\n\n- uno\n- dos\n\n</details>'
    const { json, md: out } = roundTrip(md)
    expect(types(json)).toEqual(['details'])
    expect(out.trim()).toBe(md)
  })

  it('tabla GFM, resaltado, código con lenguaje y tareas', () => {
    const md = [
      '| Día | Plan |',
      '| --- | --- |',
      '| Lunes | ==Gym== |',
      '',
      '```ts',
      'const x = 1',
      '```',
      '',
      '- [x] hecho',
      '- [ ] pendiente',
    ].join('\n')
    const { json, md: out } = roundTrip(md)
    expect(types(json)).toEqual(['table', 'codeBlock', 'taskList'])
    const again = roundTrip(out)
    expect(types(again.json)).toEqual(['table', 'codeBlock', 'taskList'])
    expect(out).toContain('==Gym==')
    expect(out).toContain('```ts')
    expect(out).toContain('- [x] hecho')
  })

  it('anchos de columna de tabla en un comentario', () => {
    const md = ['<!-- widths: 120,0,240 -->', '| A | B | C |', '| --- | --- | --- |', '| 1 | 2 | 3 |', '', 'Fin'].join('\n')
    const { json, md: out } = roundTrip(md)
    expect(types(json)).toEqual(['table', 'paragraph'])
    const cells = json.content![0].content![1].content!
    expect(cells.map((c) => c.attrs?.colwidth ?? null)).toEqual([[120], null, [240]])
    expect(out).toContain('<!-- widths: 120,0,240 -->\n| A')
    expect(roundTrip(out).md).toBe(out)
    // Sin anchos no se añade el comentario.
    expect(roundTrip('| A | B |\n| --- | --- |\n| 1 | 2 |').md).not.toContain('widths')
  })

  it('enlaces entre notas, color, columnas, incrustados y fórmulas', () => {
    const md = [
      'Ver [[Plan de diseño]] y <span data-color="red">urgente</span> con $x^2$.',
      '',
      '<!-- columns -->',
      'Izquierda',
      '<!-- column -->',
      '- derecha',
      '<!-- /columns -->',
      '',
      '@[embed](https://www.youtube.com/watch?v=dQw4w9WgXcQ)',
      '',
      '$$',
      'E = mc^2',
      '$$',
    ].join('\n')
    const { json, md: out } = roundTrip(md)
    expect(types(json)).toEqual(['paragraph', 'columns', 'embed', 'blockMath'])
    const para = JSON.stringify(json.content![0])
    expect(para).toContain('"noteLink"')
    expect(para).toContain('"textColor"')
    expect(para).toContain('"inlineMath"')
    expect(out.trim()).toBe(md)
  })
})
