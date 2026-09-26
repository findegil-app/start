import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import type { JSONContent } from '@tiptap/core'

const DETAILS_RE = /^<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>[ \t]*(?:\n|$)/

/**
 * Toggle (bloque desplegable). En Markdown se guarda como <details>, que GitHub muestra plegado:
 *   <details>
 *   <summary>Título</summary>
 *
 *   Contenido…
 *
 *   </details>
 */
export const Toggle = Details.extend({
  markdownTokenizer: {
    name: 'details',
    level: 'block',
    start: (src: string) => src.indexOf('<details>'),
    tokenize(src, _tokens, lexer) {
      const m = DETAILS_RE.exec(src)
      if (!m) return undefined
      return {
        type: 'details',
        raw: m[0],
        summaryTokens: lexer.inlineTokens(m[1].trim()),
        tokens: lexer.blockTokens(m[2].trim()),
      }
    },
  },
  parseMarkdown(token, h) {
    const body = h.parseChildren(token.tokens ?? [])
    return h.createNode('details', {}, [
      h.createNode('detailsSummary', {}, h.parseInline(token.summaryTokens ?? [])),
      h.createNode('detailsContent', {}, body.length ? body : [h.createNode('paragraph')]),
    ])
  },
  renderMarkdown(node, h) {
    const [summary, content] = (node.content ?? []) as JSONContent[]
    const title = h.renderChildren(summary?.content ?? []).replace(/\n/g, ' ').trim()
    const body = h.renderChildren(content?.content ?? [], '\n\n').trim()
    return `<details>\n<summary>${title}</summary>\n\n${body}\n\n</details>`
  },
}).configure({ persist: true, HTMLAttributes: { class: 'toggle' } })

export { DetailsContent as ToggleContent, DetailsSummary as ToggleSummary }
