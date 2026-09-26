import { Node } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    embed: { setEmbed: (src: string) => ReturnType }
  }
}

/** Convierte enlaces de vídeo conocidos en su URL de reproductor incrustable. */
export function embedUrl(src: string): { url: string; kind: 'video' | 'web' } {
  try {
    const u = new URL(src)
    const host = u.hostname.replace(/^www\.|^m\./, '')
    if (host === 'youtu.be') return { url: `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`, kind: 'video' }
    if (host === 'youtube.com') {
      const id = u.searchParams.get('v') ?? u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]+)/)?.[1]
      if (id) return { url: `https://www.youtube-nocookie.com/embed/${id}`, kind: 'video' }
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.match(/\/(\d+)/)?.[1]
      if (id) return { url: `https://player.vimeo.com/video/${id}`, kind: 'video' }
    }
    if (host === 'loom.com') return { url: src.replace('/share/', '/embed/'), kind: 'video' }
    if (host === 'open.spotify.com') return { url: src.replace('open.spotify.com/', 'open.spotify.com/embed/'), kind: 'web' }
    if (host === 'figma.com') return { url: `https://www.figma.com/embed?embed_host=findegil&url=${encodeURIComponent(src)}`, kind: 'web' }
    return { url: src, kind: 'web' }
  } catch {
    return { url: src, kind: 'web' }
  }
}

const EMBED_RE = /^@\[embed\]\((\S+?)\)[ \t]*(?:\n|$)/

/**
 * Vídeo o web incrustados. En Markdown: @[embed](https://…), una línea legible con la URL.
 * Muchas webs impiden mostrarse dentro de otras; siempre queda el enlace "Open".
 */
export const Embed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return { src: { default: '' } }
  },

  parseHTML: () => [{ tag: 'div[data-embed]', getAttrs: (el) => ({ src: (el as HTMLElement).getAttribute('data-embed') }) }],
  renderHTML: ({ node }) => ['div', { 'data-embed': node.attrs.src }],

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div')
      dom.className = 'embed'
      dom.contentEditable = 'false'
      const { url, kind } = embedUrl(node.attrs.src)
      dom.dataset.kind = kind
      const frame = document.createElement('iframe')
      frame.src = url
      frame.loading = 'lazy'
      frame.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write'
      frame.allowFullscreen = true
      frame.referrerPolicy = 'strict-origin-when-cross-origin'
      if (kind === 'web') frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms allow-presentation')
      const bar = document.createElement('div')
      bar.className = 'embed-bar'
      const link = document.createElement('a')
      link.href = node.attrs.src
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.textContent = `${node.attrs.src.replace(/^https?:\/\//, '').slice(0, 70)}  ↗`
      bar.append(link)
      dom.append(frame, bar)
      return { dom }
    }
  },

  addCommands() {
    return {
      setEmbed:
        (src) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { src } }),
    }
  },

  markdownTokenizer: {
    name: 'embed',
    level: 'block',
    start: (src: string) => src.indexOf('@[embed]('),
    tokenize(src) {
      const m = EMBED_RE.exec(src)
      return m ? { type: 'embed', raw: m[0], src: m[1] } : undefined
    },
  },
  parseMarkdown: (token, h) => h.createNode('embed', { src: token.src }),
  renderMarkdown: (node) => `@[embed](${node.attrs?.src ?? ''})`,
})
