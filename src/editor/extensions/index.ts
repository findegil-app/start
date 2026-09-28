import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Mathematics } from '@tiptap/extension-mathematics'
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
import { Column, Columns } from './Columns'
import { Embed } from './Embed'
import { NoteLink } from './NoteLink'
import { ResizableTable } from './ResizableTable'
import { TextColor } from './TextColor'
import { Toggle, ToggleContent, ToggleSummary } from './Toggle'

/** Edición de fórmulas al hacer clic (lo conecta NoteEditor, que tiene acceso al editor). */
export const mathHost = {
  edit: (_kind: 'inline' | 'block', _latex: string, _pos: number): void => {},
}

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
    TableKit.configure({ table: false }),
    ResizableTable,
    Toggle,
    ToggleSummary,
    ToggleContent,
    Callout,
    TextColor,
    Columns,
    Column,
    Embed,
    NoteLink,
    Mathematics.configure({
      katexOptions: { throwOnError: false },
      inlineOptions: { onClick: (node, pos) => mathHost.edit('inline', node.attrs.latex, pos) },
      blockOptions: { onClick: (node, pos) => mathHost.edit('block', node.attrs.latex, pos) },
    }),
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
