import Image from '@tiptap/extension-image'
import { resolveImageSrc } from '../stores/assets'

/**
 * Imagen cuyo `src` en el Markdown es una ruta del repo (../assets/x.webp).
 * El NodeView la resuelve a un blob: local (o la descarga de GitHub) sin alterar el Markdown.
 */
export const AssetImage = Image.extend({
  addNodeView() {
    return ({ node }) => {
      const img = document.createElement('img')
      img.className = 'note-image'
      let src = node.attrs.src as string
      const apply = (n: typeof node) => {
        img.alt = n.attrs.alt ?? ''
        if (n.attrs.title) img.title = n.attrs.title
      }
      const load = (s: string) =>
        resolveImageSrc(s).then((url) => {
          if (src !== s) return
          if (url) img.src = url
          else img.classList.add('missing')
        })
      apply(node)
      void load(src)
      return {
        dom: img,
        update(updated) {
          if (updated.type.name !== 'image') return false
          apply(updated)
          if (updated.attrs.src !== src) {
            src = updated.attrs.src
            img.classList.remove('missing')
            void load(src)
          }
          return true
        },
      }
    }
  },
})
