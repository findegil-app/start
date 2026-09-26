import { mergeAttributes, Node } from '@tiptap/core'

export const CALLOUT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const
export type CalloutType = (typeof CALLOUT_TYPES)[number]
export const CALLOUT_ICON: Record<CalloutType, string> = { note: 'ℹ️', tip: '💡', important: '📌', warning: '⚠️', caution: '⛔' }

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: { setCallout: (type?: CalloutType) => ReturnType }
  }
}

const ALERT_RE = /^> *\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][^\n]*(?:\n|$)((?:>[^\n]*(?:\n|$))*)/i

/**
 * Callout (bloque destacado). En Markdown usa la sintaxis de alertas de GitHub, que se ve bien en el repo:
 *   > [!TIP]
 *   > Texto…
 */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      type: {
        default: 'note',
        parseHTML: (el) => el.getAttribute('data-callout') ?? 'note',
        renderHTML: (attrs) => ({ 'data-callout': attrs.type }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'callout' }), 0]
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div')
      dom.className = 'callout'
      const icon = document.createElement('button')
      icon.type = 'button'
      icon.className = 'callout-icon'
      icon.contentEditable = 'false'
      icon.title = 'Change callout type'
      const content = document.createElement('div')
      content.className = 'callout-content'
      dom.append(icon, content)
      let current = node
      const paint = () => {
        dom.dataset.callout = current.attrs.type
        icon.textContent = CALLOUT_ICON[current.attrs.type as CalloutType] ?? 'ℹ️'
      }
      icon.addEventListener('mousedown', (e) => e.preventDefault())
      icon.addEventListener('click', () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (pos === undefined || !editor.isEditable) return
        const next = CALLOUT_TYPES[(CALLOUT_TYPES.indexOf(current.attrs.type) + 1) % CALLOUT_TYPES.length]
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, type: next }))
      })
      paint()
      return {
        dom,
        contentDOM: content,
        update(updated) {
          if (updated.type.name !== 'callout') return false
          current = updated
          paint()
          return true
        },
      }
    }
  },

  addCommands() {
    return {
      setCallout:
        (type = 'note') =>
        ({ commands }) =>
          commands.wrapIn(this.name, { type }),
    }
  },

  markdownTokenizer: {
    name: 'callout',
    level: 'block',
    start: (src: string) => src.search(/^> *\[!/m),
    tokenize(src, _tokens, lexer) {
      const m = ALERT_RE.exec(src)
      if (!m) return undefined
      const inner = m[2].replace(/^> ?/gm, '')
      return { type: 'callout', raw: m[0], calloutType: m[1].toLowerCase(), tokens: lexer.blockTokens(inner) }
    },
  },

  parseMarkdown(token, h) {
    const children = h.parseChildren(token.tokens ?? [])
    return h.createNode('callout', { type: token.calloutType ?? 'note' }, children.length ? children : [h.createNode('paragraph')])
  },

  renderMarkdown(node, h) {
    const body = h.renderChildren(node.content ?? [], '\n\n').replace(/\s+$/, '')
    const quoted = body
      .split('\n')
      .map((l) => (l ? `> ${l}` : '>'))
      .join('\n')
    return `> [!${String(node.attrs?.type ?? 'note').toUpperCase()}]\n${quoted}`
  },
})
