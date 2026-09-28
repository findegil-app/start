import type { JSONContent, MarkdownToken } from '@tiptap/core'
import { Table } from '@tiptap/extension-table'

const WIDTHS_RE = /^<!-- widths: ([\d, ]+) -->[ \t]*\n/

type Tokenizer = NonNullable<typeof Table.config.markdownTokenizer>
const base = Table.config.markdownTokenizer as Tokenizer
const baseParse = Table.config.parseMarkdown!
const baseRender = Table.config.renderMarkdown!

/**
 * Tabla con columnas redimensionables. Los anchos se guardan en un comentario HTML justo
 * encima de la tabla (invisible en GitHub, donde la tabla se sigue viendo normal):
 *   <!-- widths: 120,240,0 -->
 *   | A | B | C |
 * 0 = columna sin ancho fijo.
 */
export const ResizableTable = Table.extend({
  addOptions() {
    return { ...this.parent!(), resizable: true, cellMinWidth: 60 }
  },

  markdownTokenizer: {
    name: 'table',
    level: 'block',
    start(src: string) {
      const m = /(^|\n)<!-- widths: /.exec(src)
      const comment = m ? m.index + m[1].length : -1
      const table = base.start ? (base.start as (s: string) => number)(src) : -1
      return comment >= 0 && (table < 0 || comment < table) ? comment : table
    },
    tokenize(src, tokens, helper) {
      const m = WIDTHS_RE.exec(src)
      if (!m) return base.tokenize(src, tokens, helper)
      const rest = src.slice(m[0].length)
      const blank = rest.indexOf('\n\n')
      const block = helper.blockTokens(blank >= 0 ? rest.slice(0, blank) : rest)
      const table = block[0]
      if (table?.type !== 'table' || !table.raw) return undefined
      const lines = table.raw.replace(/\n+$/, '').split('\n').length
      const widths = m[1].split(',').map((w) => Number.parseInt(w, 10) || 0)
      return { ...table, raw: m[0] + rest.split('\n').slice(0, lines).join('\n'), widths }
    },
  },

  parseMarkdown(token, h) {
    const node = baseParse.call(this, token, h) as JSONContent
    const widths = (token as MarkdownToken & { widths?: number[] }).widths
    if (widths?.some((w) => w > 0)) {
      for (const row of node.content ?? []) {
        row.content?.forEach((cell, i) => {
          if (widths[i] > 0) cell.attrs = { ...cell.attrs, colwidth: [widths[i]] }
        })
      }
    }
    return node
  },

  renderMarkdown(node, h, ...rest) {
    const md = baseRender.call(this, node, h, ...rest)
    const first = node.content?.[0]?.content ?? []
    const widths = first.flatMap((cell) => {
      const span = (cell.attrs?.colspan as number) || 1
      const cw = cell.attrs?.colwidth as number[] | null | undefined
      return Array.from({ length: span }, (_, i) => Math.round(cw?.[i] ?? 0))
    })
    return widths.some((w) => w > 0) ? `<!-- widths: ${widths.join(',')} -->\n${md.replace(/^\n+/, '')}` : md
  },
})
