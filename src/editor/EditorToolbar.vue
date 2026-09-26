<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { ref } from 'vue'

const props = defineProps<{ editor: Editor; busy: boolean }>()
const emit = defineEmits<{ images: [files: File[]] }>()
const fileInput = ref<HTMLInputElement>()

type Action = { label: string; title: string; run: () => void; active?: () => boolean; cls?: string }

const c = () => props.editor.chain().focus()
const actions: (Action | '|')[] = [
  { label: 'B', title: 'Bold (Ctrl+B)', cls: 'b', run: () => c().toggleBold().run(), active: () => props.editor.isActive('bold') },
  { label: 'I', title: 'Italic (Ctrl+I)', cls: 'i', run: () => c().toggleItalic().run(), active: () => props.editor.isActive('italic') },
  { label: 'S', title: 'Strikethrough', cls: 's', run: () => c().toggleStrike().run(), active: () => props.editor.isActive('strike') },
  { label: '</>', title: 'Code', run: () => c().toggleCode().run(), active: () => props.editor.isActive('code') },
  '|',
  { label: 'H1', title: 'Heading 1', run: () => c().toggleHeading({ level: 1 }).run(), active: () => props.editor.isActive('heading', { level: 1 }) },
  { label: 'H2', title: 'Heading 2', run: () => c().toggleHeading({ level: 2 }).run(), active: () => props.editor.isActive('heading', { level: 2 }) },
  { label: 'H3', title: 'Heading 3', run: () => c().toggleHeading({ level: 3 }).run(), active: () => props.editor.isActive('heading', { level: 3 }) },
  '|',
  { label: '•', title: 'Bullet list', run: () => c().toggleBulletList().run(), active: () => props.editor.isActive('bulletList') },
  { label: '1.', title: 'Numbered list', run: () => c().toggleOrderedList().run(), active: () => props.editor.isActive('orderedList') },
  { label: '☑', title: 'Task list', run: () => c().toggleTaskList().run(), active: () => props.editor.isActive('taskList') },
  { label: '❝', title: 'Quote', run: () => c().toggleBlockquote().run(), active: () => props.editor.isActive('blockquote') },
  { label: '{ }', title: 'Code block', run: () => c().toggleCodeBlock().run(), active: () => props.editor.isActive('codeBlock') },
  { label: '―', title: 'Divider', run: () => c().setHorizontalRule().run() },
  '|',
  { label: '🔗', title: 'Link', run: setLink, active: () => props.editor.isActive('link') },
  { label: '🖼', title: 'Image (converted to WebP)', run: () => fileInput.value?.click() },
]

function setLink() {
  const prev = props.editor.getAttributes('link').href as string | undefined
  const url = prompt('Link URL', prev ?? 'https://')
  if (url === null) return
  if (!url.trim()) c().extendMarkRange('link').unsetLink().run()
  else c().extendMarkRange('link').setLink({ href: url.trim() }).run()
}

function onFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length) emit('images', files)
}
</script>

<template>
  <div class="toolbar" role="toolbar" aria-label="Formatting">
    <template v-for="(a, i) in actions" :key="i">
      <span v-if="a === '|'" class="sep" />
      <button
        v-else
        type="button"
        :class="[a.cls, { active: a.active?.() }]"
        :title="a.title"
        :aria-label="a.title"
        @mousedown.prevent
        @click="a.run()"
      >
        {{ a.label }}
      </button>
    </template>
    <span v-if="busy" class="toolbar-note">Processing image…</span>
    <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="onFiles" />
  </div>
</template>
