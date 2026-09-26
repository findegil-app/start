import type { Container, ContainerKind, Note } from '../db'
import { fileNameFromTitle } from './paths'

/** Carpetas raíz del repo de notas. */
export const ROOTS = {
  inbox: '00 Landing Zone',
  project: '01 Projects',
  area: '02 Areas',
  resource: '03 Resources',
  archive: '04 Archive',
  scratch: 'Scratch',
} as const

const ARCHIVE_SUB: Record<ContainerKind, string> = { project: 'Projects', area: 'Areas', resource: 'Resources' }
const KIND_BY_ROOT: Record<string, ContainerKind> = { [ROOTS.project]: 'project', [ROOTS.area]: 'area', [ROOTS.resource]: 'resource' }
const KIND_BY_ARCHIVE: Record<string, ContainerKind> = { Projects: 'project', Areas: 'area', Resources: 'resource' }

export const META_FILE: Record<ContainerKind, string> = { project: '_project.md', area: '_area.md', resource: '_resource.md' }
const META_RE = /^(.*)\/_(project|area|resource)\.md$/

export const KIND_LABEL: Record<ContainerKind, string> = { project: 'Project', area: 'Area', resource: 'Resource' }
export const KIND_PLURAL: Record<ContainerKind, string> = { project: 'Projects', area: 'Areas', resource: 'Resources' }

/** Carpeta "base" (sin sufijo de colisión) que le corresponde a un contenedor. */
export function containerBaseFolder(c: Pick<Container, 'kind' | 'name' | 'status'>): string {
  const name = fileNameFromTitle(c.name)
  return c.status === 'archived' ? `${ROOTS.archive}/${ARCHIVE_SUB[c.kind]}/${name}` : `${ROOTS[c.kind]}/${name}`
}

export const dirname = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')

export type FolderInfo =
  | { type: 'inbox' }
  | { type: 'scratch' }
  | { type: 'container'; kind: ContainerKind; archived: boolean; folder: string; name: string }
  | { type: 'unknown' }

/** Interpreta una carpeta del repo según la estructura PARA. */
export function classifyFolder(folder: string): FolderInfo {
  if (folder === ROOTS.inbox) return { type: 'inbox' }
  if (folder === ROOTS.scratch) return { type: 'scratch' }
  const parts = folder.split('/')
  if (parts.length === 2 && KIND_BY_ROOT[parts[0]]) {
    return { type: 'container', kind: KIND_BY_ROOT[parts[0]], archived: false, folder, name: parts[1] }
  }
  if (parts.length === 3 && parts[0] === ROOTS.archive && KIND_BY_ARCHIVE[parts[1]]) {
    return { type: 'container', kind: KIND_BY_ARCHIVE[parts[1]], archived: true, folder, name: parts[2] }
  }
  return { type: 'unknown' }
}

export function parseMetaPath(path: string): { folder: string; kind: ContainerKind } | null {
  const m = META_RE.exec(path)
  return m ? { folder: m[1], kind: m[2] as ContainerKind } : null
}

/** Carpeta donde debe vivir una nota, dadas las carpetas asignadas a los contenedores. */
export function noteFolder(note: Pick<Note, 'bucket' | 'containerId'>, containerFolders: Map<string, string>): string {
  if (note.bucket === 'scratch') return ROOTS.scratch
  if (note.bucket === 'container' && note.containerId) {
    const folder = containerFolders.get(note.containerId)
    if (folder) return folder
  }
  return ROOTS.inbox
}
