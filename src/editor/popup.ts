import type { SuggestionProps } from '@tiptap/suggestion'
import { VueRenderer } from '@tiptap/vue-3'
import type { Component } from 'vue'

/** Render genérico de sugerencias (menú "/" y "[[") como popup flotante junto al cursor. */
export function popupRenderer<I>(component: Component) {
  return () => {
    let renderer: VueRenderer | null = null
    const close = () => {
      renderer?.element?.remove()
      renderer?.destroy()
      renderer = null
    }
    const place = (p: SuggestionProps<I, I>) => {
      const rect = p.clientRect?.()
      const el = renderer?.element as HTMLElement | undefined
      if (!rect || !el) return
      const below = rect.bottom + 320 < window.innerHeight
      el.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 310))}px`
      el.style.top = below ? `${rect.bottom + 6}px` : ''
      el.style.bottom = below ? '' : `${window.innerHeight - rect.top + 6}px`
    }
    return {
      onStart: (p: SuggestionProps<I, I>) => {
        renderer = new VueRenderer(component, { props: { items: p.items, command: p.command, query: p.query }, editor: p.editor })
        const el = renderer.element as HTMLElement
        el.classList.add('slash-popup')
        document.body.append(el)
        place(p)
      },
      onUpdate: (p: SuggestionProps<I, I>) => {
        renderer?.updateProps({ items: p.items, command: p.command, query: p.query })
        place(p)
      },
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === 'Escape') {
          close()
          return true
        }
        return (renderer?.ref as { onKeyDown?: (e: KeyboardEvent) => boolean } | undefined)?.onKeyDown?.(event) ?? false
      },
      onExit: close,
    }
  }
}
