import { Extension } from '@tiptap/core'
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import { VueRenderer } from '@tiptap/vue-3'
import { filterBlocks, type BlockItem } from '../blocks'
import SlashMenu from '../SlashMenu.vue'

/** Menú "/" estilo Notion para insertar bloques. */
export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion<BlockItem, BlockItem>({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        // No se abre dentro de bloques de código.
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        items: ({ query }) => filterBlocks(query),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          let renderer: VueRenderer | null = null
          const place = (p: SuggestionProps<BlockItem, BlockItem>) => {
            const rect = p.clientRect?.()
            const el = renderer?.element as HTMLElement | undefined
            if (!rect || !el) return
            const below = rect.bottom + 320 < window.innerHeight
            el.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`
            el.style.top = below ? `${rect.bottom + 6}px` : ''
            el.style.bottom = below ? '' : `${window.innerHeight - rect.top + 6}px`
          }
          return {
            onStart: (p) => {
              renderer = new VueRenderer(SlashMenu, { props: { items: p.items, command: p.command }, editor: p.editor })
              const el = renderer.element as HTMLElement
              el.classList.add('slash-popup')
              document.body.append(el)
              place(p)
            },
            onUpdate: (p) => {
              renderer?.updateProps({ items: p.items, command: p.command })
              place(p)
            },
            onKeyDown: ({ event }) => {
              if (event.key === 'Escape') {
                renderer?.destroy()
                renderer?.element?.remove()
                renderer = null
                return true
              }
              return (renderer?.ref as { onKeyDown?: (e: KeyboardEvent) => boolean } | undefined)?.onKeyDown?.(event) ?? false
            },
            onExit: () => {
              renderer?.element?.remove()
              renderer?.destroy()
              renderer = null
            },
          }
        },
      }),
    ]
  },
})
