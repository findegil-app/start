<script setup lang="ts">
import { DragHandle } from '@tiptap/extension-drag-handle-vue-3'
import type { Node as PMNode } from '@tiptap/pm/model'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { addImage, updateNote } from '../stores/notes'
import { PICK_IMAGE_EVENT } from './blocks'
import BubbleToolbar from './BubbleToolbar.vue'
import EditorToolbar from './EditorToolbar.vue'
import { contentExtensions } from './extensions'
import { SlashCommand } from './extensions/SlashCommand'

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
  extensions: [...contentExtensions(), SlashCommand],
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

// Selector de imágenes para el bloque "Image" del menú "/".
const fileInput = ref<HTMLInputElement>()
const root = ref<HTMLElement>()
const pickImage = () => fileInput.value?.click()
function onFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const files = imageFiles(input.files)
  input.value = ''
  if (files.length) void insertImages(files)
}

// Tirador de bloques: "+" inserta un bloque debajo y abre el menú "/".
let hovered: PMNode | null = null
function onNodeChange({ node }: { node: PMNode | null }) {
  hovered = node
}
function addBlockBelow() {
  const ed = editor.value
  if (!ed || !hovered) return
  let at: number | null = null
  ed.state.doc.forEach((child, offset) => {
    if (child === hovered) at = offset + child.nodeSize
  })
  if (at === null) return
  ed.chain().insertContentAt(at, { type: 'paragraph' }).focus(at + 1).insertContent('/').run()
}

const flushOnHide = () => document.visibilityState === 'hidden' && flush()
onMounted(() => {
  document.addEventListener('visibilitychange', flushOnHide)
  window.addEventListener('pagehide', flush)
  root.value?.addEventListener(PICK_IMAGE_EVENT, pickImage)
})
onBeforeUnmount(() => {
  flush()
  document.removeEventListener('visibilitychange', flushOnHide)
  window.removeEventListener('pagehide', flush)
})

defineExpose({ focus: () => editor.value?.commands.focus('start') })
</script>

<template>
  <div ref="root" class="note-editor">
    <EditorToolbar v-if="editor" :editor="editor" :busy="imageBusy > 0" @images="insertImages" />
    <template v-if="editor">
      <DragHandle :editor="editor" class="drag-handle" :on-node-change="onNodeChange">
        <button type="button" class="handle-btn" title="Add block below" @mousedown.prevent @click="addBlockBelow">＋</button>
        <span class="handle-grip" title="Drag to move">⋮⋮</span>
      </DragHandle>
      <BubbleToolbar :editor="editor" />
    </template>
    <EditorContent :editor="editor" class="editor-content" />
    <p v-if="imageBusy" class="muted small">Processing image…</p>
    <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="onFiles" />
  </div>
</template>
