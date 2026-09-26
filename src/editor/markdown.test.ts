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
