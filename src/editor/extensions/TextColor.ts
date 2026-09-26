import { Mark, mergeAttributes } from '@tiptap/core'

/** Paleta estilo Notion; el color real depende del tema (ver style.css). */
export const TEXT_COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const
export type TextColorName = (typeof TEXT_COLORS)[number]

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textColor: {
      setTextColor: (color: TextColorName) => ReturnType
      unsetTextColor: () => ReturnType
    }
  }
}

const SPAN_RE = /^<span data-color="([a-z]+)">([\s\S]*?)<\/span>/

/** Color de texto. En Markdown: <span data-color="red">texto</span> (GitHub muestra el texto sin color). */
export const TextColor = Mark.create({
  name: 'textColor',

  addAttributes() {
    return {
      color: {
        default: 'gray',
        parseHTML: (el) => el.getAttribute('data-color'),
        renderHTML: (attrs) => ({ 'data-color': attrs.color }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-color]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'text-color' }), 0]
  },

  addCommands() {
    return {
      setTextColor:
        (color) =>
        ({ commands }) =>
          commands.setMark(this.name, { color }),
      unsetTextColor:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    }
  },

  markdownTokenizer: {
    name: 'textColor',
    level: 'inline',
    start: (src: string) => src.indexOf('<span data-color='),
    tokenize(src, _tokens, lexer) {
      const m = SPAN_RE.exec(src)
      if (!m) return undefined
      return { type: 'textColor', raw: m[0], color: m[1], tokens: lexer.inlineTokens(m[2]) }
    },
  },

  parseMarkdown(token, h) {
    return h.applyMark('textColor', h.parseInline(token.tokens ?? []), { color: token.color })
  },

  renderMarkdown(node, h) {
    return `<span data-color="${node.attrs?.color ?? 'gray'}">${h.renderChildren(node)}</span>`
  },
})
