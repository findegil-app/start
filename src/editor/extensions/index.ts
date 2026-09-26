import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import { TableKit } from '@tiptap/extension-table'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import type { AnyExtension } from '@tiptap/core'
import { common, createLowlight } from 'lowlight'
import { AssetImage } from '../AssetImage'
import { Callout } from './Callout'
import { Toggle, ToggleContent, ToggleSummary } from './Toggle'

/** Extensiones del editor que definen el contenido y su Markdown (compartidas con los tests). */
export function contentExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({ underline: false, codeBlock: false, link: { openOnClick: false, autolink: true } }),
    Markdown,
    AssetImage,
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight,
    CodeBlockLowlight.configure({ lowlight: createLowlight(common), defaultLanguage: null }),
    TableKit.configure({ table: { resizable: false } }),
    Toggle,
    ToggleSummary,
    ToggleContent,
    Callout,
    Placeholder.configure({
      includeChildren: true,
      placeholder: ({ node }) => {
        if (node.type.name === 'heading') return `Heading ${node.attrs.level}`
        if (node.type.name === 'detailsSummary') return 'Toggle title'
        return "Type '/' for commands…"
      },
    }),
  ]
}
