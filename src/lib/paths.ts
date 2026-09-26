export const NOTES_DIR = 'notes'
export const ASSETS_DIR = 'assets'
export const UNTITLED = 'Sin título'

const MAX_NAME = 80

/** Nombre de archivo legible a partir del título (conserva tildes y espacios). */
export function fileNameFromTitle(title: string): string {
  const name = title
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|#%[\]^`{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .slice(0, MAX_NAME)
    .trim()
  return name || UNTITLED
}

/** notes/<Título>.md, o notes/<Título> (n).md si la ruta está ocupada (comparación sin mayúsculas). */
export function notePathForTitle(title: string, isTaken: (lowerPath: string) => boolean): string {
  const base = fileNameFromTitle(title)
  for (let n = 1; ; n++) {
    const path = `${NOTES_DIR}/${n === 1 ? base : `${base} (${n})`}.md`
    if (!isTaken(path.toLowerCase())) return path
  }
}

const NOTE_PATH_RE = /^notes\/.+\.md$/i
export const isNotePath = (path: string) => NOTE_PATH_RE.test(path)

/** Nombre sin carpeta ni extensión: se usa como título si el archivo no tiene frontmatter. */
export function titleFromPath(path: string): string {
  return path.replace(/^.*\//, '').replace(/\.md$/i, '')
}

/** Referencia usada dentro del Markdown (relativa a notes/, así también se ve bien en GitHub). */
export const assetRef = (assetPath: string) => `../${assetPath}`

/** Convierte un src de imagen del Markdown en ruta de asset del repo, o null si es externo. */
export function assetPathFromSrc(src: string | null | undefined): string | null {
  if (!src) return null
  const m = /^(?:\.\.\/|\.\/|\/)?(assets\/[^?#]+)$/.exec(src)
  return m ? decodeURI(m[1]) : null
}
