import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import { filterBlocks, type BlockItem } from '../blocks'
import { popupRenderer } from '../popup'
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
        render: popupRenderer<BlockItem>(SlashMenu),
      }),
    ]
  },
})
