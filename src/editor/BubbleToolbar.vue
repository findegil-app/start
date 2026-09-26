<script setup lang="ts">
import type { Editor as CoreEditor } from '@tiptap/core'
import type { Editor } from '@tiptap/vue-3'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { BLOCKS } from './blocks'

const props = defineProps<{ editor: Editor }>()

const c = () => props.editor.chain().focus()
const inTable = () => props.editor.isActive('table')

/** Se muestra al seleccionar texto, o con el cursor dentro de una tabla (acciones de filas/columnas). */
function shouldShow({ editor, state }: { editor: CoreEditor; state: CoreEditor['state'] }) {
  if (!editor.isEditable) return false
  if (editor.isActive('table')) return true
  const { empty } = state.selection
  if (empty || editor.isActive('codeBlock') || editor.isActive('image')) return false
  return state.doc.textBetween(state.selection.from, state.selection.to).trim().length > 0
}

function setLink() {
  const prev = props.editor.getAttributes('link').href as string | undefined
  const url = prompt('Link URL', prev ?? 'https://')
  if (url === null) return
  if (!url.trim()) c().extendMarkRange('link').unsetLink().run()
  else c().extendMarkRange('link').setLink({ href: url.trim() }).run()
}

const TURN_INTO = ['Text', 'Heading 1', 'Heading 2', 'Heading 3', 'To-do list', 'Bulleted list', 'Numbered list', 'Quote', 'Callout', 'Code']
const turnOptions = BLOCKS.filter((b) => TURN_INTO.includes(b.title))

function turnInto(e: Event) {
  const select = e.target as HTMLSelectElement
  const block = turnOptions.find((b) => b.title === select.value)
  select.value = ''
  block?.run(props.editor)
}
</script>

<template>
  <BubbleMenu :editor="editor" :should-show="shouldShow" class="bubble" :options="{ placement: 'top' }">
    <template v-if="inTable() && editor.state.selection.empty">
      <button type="button" title="Add row below" @mousedown.prevent @click="c().addRowAfter().run()">＋ Row</button>
      <button type="button" title="Add column right" @mousedown.prevent @click="c().addColumnAfter().run()">＋ Col</button>
      <button type="button" title="Delete row" @mousedown.prevent @click="c().deleteRow().run()">− Row</button>
      <button type="button" title="Delete column" @mousedown.prevent @click="c().deleteColumn().run()">− Col</button>
      <span class="sep" />
      <button type="button" class="danger" title="Delete table" @mousedown.prevent @click="c().deleteTable().run()">Delete table</button>
    </template>
    <template v-else>
      <select class="turn-into" aria-label="Turn into" @mousedown.stop @change="turnInto">
        <option value="">Turn into…</option>
        <option v-for="b in turnOptions" :key="b.title" :value="b.title">{{ b.icon }} {{ b.title }}</option>
      </select>
      <span class="sep" />
      <button type="button" class="b" :class="{ active: editor.isActive('bold') }" title="Bold (Ctrl+B)" @mousedown.prevent @click="c().toggleBold().run()">B</button>
      <button type="button" class="i" :class="{ active: editor.isActive('italic') }" title="Italic (Ctrl+I)" @mousedown.prevent @click="c().toggleItalic().run()">I</button>
      <button type="button" class="s" :class="{ active: editor.isActive('strike') }" title="Strikethrough" @mousedown.prevent @click="c().toggleStrike().run()">S</button>
      <button type="button" :class="{ active: editor.isActive('code') }" title="Inline code" @mousedown.prevent @click="c().toggleCode().run()">&lt;/&gt;</button>
      <button type="button" class="hl" :class="{ active: editor.isActive('highlight') }" title="Highlight (Ctrl+Shift+H)" @mousedown.prevent @click="c().toggleHighlight().run()">
        <mark>A</mark>
      </button>
      <button type="button" :class="{ active: editor.isActive('link') }" title="Link" @mousedown.prevent @click="setLink">🔗</button>
    </template>
  </BubbleMenu>
</template>
