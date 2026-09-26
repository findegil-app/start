import type { Editor, Range } from '@tiptap/core'
import type { CalloutType } from './extensions/Callout'

export interface BlockItem {
  title: string
  hint: string
  icon: string
  keywords: string
  run: (editor: Editor, range?: Range) => void
}

/** Pide al editor que abra el selector de imágenes (lo escucha NoteEditor). */
export const PICK_IMAGE_EVENT = 'findegil:pick-image'

const chain = (editor: Editor, range?: Range) => (range ? editor.chain().focus().deleteRange(range) : editor.chain().focus())
const callout = (type: CalloutType, title: string, icon: string, hint: string): BlockItem => ({
  title,
  hint,
  icon,
  keywords: `callout alert ${type} ${title}`,
  run: (e, r) => chain(e, r).setCallout(type).run(),
})

/** Bloques disponibles en el menú "/" y en "Turn into". */
export const BLOCKS: BlockItem[] = [
  { title: 'Text', hint: 'Plain paragraph', icon: '¶', keywords: 'text paragraph plain', run: (e, r) => chain(e, r).setParagraph().run() },
  { title: 'Heading 1', hint: 'Big section title', icon: 'H1', keywords: 'h1 heading title', run: (e, r) => chain(e, r).setHeading({ level: 1 }).run() },
  { title: 'Heading 2', hint: 'Medium section title', icon: 'H2', keywords: 'h2 heading subtitle', run: (e, r) => chain(e, r).setHeading({ level: 2 }).run() },
  { title: 'Heading 3', hint: 'Small section title', icon: 'H3', keywords: 'h3 heading', run: (e, r) => chain(e, r).setHeading({ level: 3 }).run() },
  { title: 'To-do list', hint: 'Track tasks with checkboxes', icon: '☑', keywords: 'todo task checkbox check', run: (e, r) => chain(e, r).toggleTaskList().run() },
  { title: 'Bulleted list', hint: 'Simple bulleted list', icon: '•', keywords: 'bullet list ul', run: (e, r) => chain(e, r).toggleBulletList().run() },
  { title: 'Numbered list', hint: 'List with numbers', icon: '1.', keywords: 'numbered ordered list ol', run: (e, r) => chain(e, r).toggleOrderedList().run() },
  { title: 'Toggle', hint: 'Collapsible section', icon: '▸', keywords: 'toggle details collapse fold', run: (e, r) => chain(e, r).setDetails().updateAttributes('details', { open: true }).run() },
  { title: 'Quote', hint: 'Capture a quote', icon: '❝', keywords: 'quote blockquote citation', run: (e, r) => chain(e, r).toggleBlockquote().run() },
  callout('note', 'Callout', 'ℹ️', 'Make text stand out'),
  callout('tip', 'Tip', '💡', 'Helpful advice'),
  callout('warning', 'Warning', '⚠️', 'Something to watch out for'),
  callout('important', 'Important', '📌', 'Key information'),
  { title: 'Code', hint: 'Code block with highlighting', icon: '{ }', keywords: 'code snippet pre', run: (e, r) => chain(e, r).toggleCodeBlock().run() },
  {
    title: 'Table',
    hint: 'Rows and columns',
    icon: '▦',
    keywords: 'table grid spreadsheet',
    run: (e, r) => chain(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  { title: 'Divider', hint: 'Visual separator', icon: '―', keywords: 'divider hr separator line', run: (e, r) => chain(e, r).setHorizontalRule().run() },
  {
    title: 'Image',
    hint: 'Upload or paste an image',
    icon: '🖼',
    keywords: 'image picture photo upload',
    run: (e, r) => {
      chain(e, r).run()
      e.view.dom.dispatchEvent(new CustomEvent(PICK_IMAGE_EVENT, { bubbles: true }))
    },
  },
  {
    title: 'Date',
    hint: "Insert today's date",
    icon: '📅',
    keywords: 'date today now',
    run: (e, r) =>
      chain(e, r)
        .insertContent(new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' ')
        .run(),
  },
]

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export function filterBlocks(query: string) {
  const q = norm(query.trim())
  if (!q) return BLOCKS
  return BLOCKS.filter((b) => norm(`${b.title} ${b.keywords}`).includes(q))
}
