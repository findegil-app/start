<script setup lang="ts">
import { Markdown } from '@tiptap/markdown'
import Placeholder from '@tiptap/extension-placeholder'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { onBeforeUnmount, ref, watch } from 'vue'
import { addImage, updateNote } from '../stores/notes'
import { AssetImage } from './AssetImage'
import EditorToolbar from './EditorToolbar.vue'

const props = defineProps<{ noteId: string; content: string }>()

const SAVE_DELAY_MS = 300
let saveTimer: ReturnType<typeof setTimeout> | undefined
let dirty = false
/** Último Markdown escrito en IndexedDB desde este editor. */
let lastSaved = props.content

function flush() {
  clearTimeout(saveTimer)
  saveTimer = undefined
  if (!dirty) return
  dirty = false
  const md = editor.value?.getMarkdown()
  if (md === undefined || md === lastSaved) return
  lastSaved = md
  void updateNote(props.noteId, { content: md })
}

function scheduleSave() {
  dirty = true
  clearTimeout(saveTimer)
  saveTimer = setTimeout(flush, SAVE_DELAY_MS)
}

const imageBusy = ref(0)
async function insertImages(files: File[], pos?: number) {
  for (const file of files) {
    imageBusy.value++
    try {
      const src = await addImage(file)
      const chain = editor.value?.chain().focus()
      if (!chain) continue
      if (pos !== undefined) chain.insertContentAt(pos, { type: 'image', attrs: { src, alt: file.name } }).run()
      else chain.setImage({ src, alt: file.name }).run()
    } catch (err) {
      alert(`Could not add the image: ${err instanceof Error ? err.message : err}`)
    } finally {
      imageBusy.value--
    }
  }
}

const imageFiles = (list?: FileList | null) => Array.from(list ?? []).filter((f) => f.type.startsWith('image/'))

const editor = useEditor({
  content: props.content,
  contentType: 'markdown',
  extensions: [
    StarterKit.configure({ underline: false, link: { openOnClick: false, autolink: true } }),
    Markdown,
    AssetImage,
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: 'Write something…' }),
  ],
  editorProps: {
    attributes: { class: 'prose', spellcheck: 'true' },
    handlePaste(_view, event) {
      const files = imageFiles(event.clipboardData?.files)
      if (!files.length) return false
      void insertImages(files)
      return true
    },
    handleDrop(view, event) {
      const files = imageFiles(event.dataTransfer?.files)
      if (!files.length) return false
      const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
      void insertImages(files, pos)
      return true
    },
  },
  onUpdate: scheduleSave,
  onBlur: flush,
})

// Cambios llegados por sync (otro dispositivo) mientras no hay edición local en curso.
watch(
  () => props.content,
  (content) => {
    if (dirty || content === lastSaved || !editor.value) return
    lastSaved = content
    editor.value.commands.setContent(content, { contentType: 'markdown', emitUpdate: false })
  },
)

const flushOnHide = () => document.visibilityState === 'hidden' && flush()
document.addEventListener('visibilitychange', flushOnHide)
window.addEventListener('pagehide', flush)

onBeforeUnmount(() => {
  flush()
  document.removeEventListener('visibilitychange', flushOnHide)
  window.removeEventListener('pagehide', flush)
})

defineExpose({ focus: () => editor.value?.commands.focus('start') })
</script>

<template>
  <div class="note-editor">
    <EditorToolbar v-if="editor" :editor="editor" :busy="imageBusy > 0" @images="insertImages" />
    <EditorContent :editor="editor" class="editor-content" />
  </div>
</template>
