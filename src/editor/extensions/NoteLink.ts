import { mergeAttributes, Node } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import { popupRenderer } from '../popup'
import NoteLinkMenu from '../NoteLinkMenu.vue'

export interface NoteLinkItem {
  title: string
  /** Ubicación legible (Projects › Web…) */
  where?: string
  create?: boolean
}

/** La app inyecta cómo buscar/crear notas y cómo abrirlas (el editor no depende del router ni de Dexie). */
export const noteLinkHost = {
  search: async (_query: string): Promise<NoteLinkItem[]> => [],
  exists: async (_title: string): Promise<boolean> => false,
  create: async (_title: string): Promise<void> => {},
  open: (_title: string): void => {},
}

export const OPEN_NOTE_EVENT = 'findegil:open-note'
const LINK_RE = /^\[\[([^\]\n|]+)\]\]/

/** Enlace a otra nota: [[Título]] en Markdown (compatible con Obsidian). */
export const NoteLink = Node.create({
  name: 'noteLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { title: { default: '' } }
  },

  parseHTML: () => [{ tag: 'a[data-note-link]', getAttrs: (el) => ({ title: (el as HTMLElement).getAttribute('data-note-link') }) }],
  renderHTML: ({ node, HTMLAttributes }) => ['a', mergeAttributes(HTMLAttributes, { 'data-note-link': node.attrs.title, class: 'note-link' }), node.attrs.title],
  renderText: ({ node }) => `[[${node.attrs.title}]]`,

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('a')
      dom.className = 'note-link'
      dom.textContent = node.attrs.title
      dom.title = `Open “${node.attrs.title}”`
      dom.addEventListener('click', (e) => {
        e.preventDefault()
        noteLinkHost.open(node.attrs.title)
      })
      void noteLinkHost.exists(node.attrs.title).then((ok) => {
        if (!ok) {
          dom.classList.add('missing')
          dom.title = `“${node.attrs.title}” doesn't exist yet — click to create it`
        }
      })
      return { dom }
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<NoteLinkItem, NoteLinkItem>({
        editor: this.editor,
        pluginKey: new PluginKey('noteLink'),
        char: '[[',
        allowSpaces: true,
        startOfLine: false,
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        items: async ({ query }) => {
          const found = await noteLinkHost.search(query)
          const q = query.trim()
          const exact = found.some((f) => f.title.toLowerCase() === q.toLowerCase())
          return q && !exact ? [...found, { title: q, create: true }] : found
        },
        command: ({ editor, range, props }) => {
          if (props.create) void noteLinkHost.create(props.title)
          editor
            .chain()
            .focus()
            .insertContentAt(range, [{ type: 'noteLink', attrs: { title: props.title } }, { type: 'text', text: ' ' }])
            .run()
        },
        render: popupRenderer<NoteLinkItem>(NoteLinkMenu),
      }),
    ]
  },

  markdownTokenizer: {
    name: 'noteLink',
    level: 'inline',
    start: (src: string) => src.indexOf('[['),
    tokenize(src) {
      const m = LINK_RE.exec(src)
      return m ? { type: 'noteLink', raw: m[0], title: m[1].trim() } : undefined
    },
  },
  parseMarkdown: (token, h) => h.createNode('noteLink', { title: token.title }),
  renderMarkdown: (node) => `[[${node.attrs?.title ?? ''}]]`,
})
