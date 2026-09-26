import { mergeAttributes, Node, type JSONContent } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columns: { insertColumns: (count?: 2 | 3) => ReturnType }
  }
}

const COLUMNS_RE = /^<!-- columns -->[ \t]*\n([\s\S]*?)\n<!-- \/columns -->[ \t]*(?:\n|$)/

/** Una columna dentro de un bloque de columnas. */
export const Column = Node.create({
  name: 'column',
  content: 'block+',
  isolating: true,
  parseHTML: () => [{ tag: 'div[data-column]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-column': '', class: 'column' }), 0],
})

/**
 * Columnas lado a lado. En Markdown se separan con comentarios HTML, invisibles en GitHub
 * (allí el contenido se ve una columna debajo de otra):
 *   <!-- columns -->
 *   Columna 1
 *   <!-- column -->
 *   Columna 2
 *   <!-- /columns -->
 */
export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column{2,3}',
  defining: true,
  isolating: true,

  parseHTML: () => [{ tag: 'div[data-columns]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-columns': '', class: 'columns' }), 0],

  addCommands() {
    return {
      insertColumns:
        (count = 2) =>
        ({ chain, state }) => {
          const from = state.selection.from
          return chain()
            .insertContent({
              type: 'columns',
              content: Array.from({ length: count }, () => ({ type: 'column', content: [{ type: 'paragraph' }] })),
            })
            .command(({ tr }) => {
              // Deja el cursor en la primera columna.
              let target: number | null = null
              tr.doc.nodesBetween(Math.max(0, from - 2), Math.min(tr.doc.content.size, from + 4), (node, pos) => {
                if (target === null && node.type.name === 'columns') target = pos + 3
                return target === null
              })
              if (target !== null) tr.setSelection(TextSelection.near(tr.doc.resolve(target)))
              return true
            })
            .run()
        },
    }
  },

  markdownTokenizer: {
    name: 'columns',
    level: 'block',
    start: (src: string) => src.indexOf('<!-- columns -->'),
    tokenize(src, _tokens, lexer) {
      const m = COLUMNS_RE.exec(src)
      if (!m) return undefined
      const parts = m[1].split(/\n<!-- column -->[ \t]*\n/).slice(0, 3)
      return { type: 'columns', raw: m[0], columns: parts.map((p) => lexer.blockTokens(p.trim())) }
    },
  },

  parseMarkdown(token, h) {
    const cols = ((token.columns ?? []) as unknown[][]).map((tokens) => {
      const body = h.parseChildren(tokens as never)
      return h.createNode('column', {}, body.length ? body : [h.createNode('paragraph')])
    })
    while (cols.length < 2) cols.push(h.createNode('column', {}, [h.createNode('paragraph')]))
    return h.createNode('columns', {}, cols)
  },

  renderMarkdown(node, h) {
    const cols = ((node.content ?? []) as JSONContent[]).map((c) => h.renderChildren(c.content ?? [], '\n\n').trim())
    return `<!-- columns -->\n${cols.join('\n<!-- column -->\n')}\n<!-- /columns -->`
  },
})
