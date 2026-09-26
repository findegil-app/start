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

/** <carpeta>/<Título>.md, o <carpeta>/<Título> (n).md si está ocupada (comparación sin mayúsculas). */
export function notePathForTitle(folder: string, title: string, isTaken: (lowerPath: string) => boolean): string {
  const base = fileNameFromTitle(title)
  for (let n = 1; ; n++) {
    const path = `${folder}/${n === 1 ? base : `${base} (${n})`}.md`
    if (!isTaken(path.toLowerCase())) return path
  }
}

/** Nombre único (con sufijo " (n)") para una carpeta de contenedor. */
export function uniqueFolder(base: string, isTaken: (lowerFolder: string) => boolean): string {
  for (let n = 1; ; n++) {
    const folder = n === 1 ? base : `${base} (${n})`
    if (!isTaken(folder.toLowerCase())) return folder
  }
}

/** ¿La ruta sigue correspondiendo al título dentro de esa carpeta? (acepta el sufijo " (n)") */
export function pathMatchesTitle(path: string, folder: string, title: string): boolean {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${esc(folder)}/${esc(fileNameFromTitle(title))}(?: \\(\\d+\\))?\\.md$`, 'i').test(path)
}

/** Nombre sin carpeta ni extensión: se usa como título si el archivo no tiene frontmatter. */
export function titleFromPath(path: string): string {
  return path.replace(/^.*\//, '').replace(/\.md$/i, '')
}

/** Referencia usada dentro del Markdown: relativa a la raíz del repo, así no cambia al mover la nota y GitHub la resuelve. */
export const assetRef = (assetPath: string) => `/${assetPath}`

/** Convierte un src de imagen del Markdown en ruta de asset del repo, o null si es externo. */
export function assetPathFromSrc(src: string | null | undefined): string | null {
  if (!src) return null
  const m = /^(?:\.\.\/|\.\/|\/)?(assets\/[^?#]+)$/.exec(src)
  return m ? decodeURI(m[1]) : null
}
