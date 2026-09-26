export const NOTES_DIR = 'notes'
export const ASSETS_DIR = 'assets'

export const notePath = (id: string) => `${NOTES_DIR}/${id}.md`

const NOTE_PATH_RE = /^notes\/([^/]+)\.md$/
export function noteIdFromPath(path: string): string | null {
  return NOTE_PATH_RE.exec(path)?.[1] ?? null
}

/** Referencia usada dentro del Markdown (relativa a notes/, así también se ve bien en GitHub). */
export const assetRef = (assetPath: string) => `../${assetPath}`

/** Convierte un src de imagen del Markdown en ruta de asset del repo, o null si es externo. */
export function assetPathFromSrc(src: string | null | undefined): string | null {
  if (!src) return null
  const m = /^(?:\.\.\/|\.\/|\/)?(assets\/[^?#]+)$/.exec(src)
  return m ? decodeURI(m[1]) : null
}
