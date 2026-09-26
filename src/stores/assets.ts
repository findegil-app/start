import { db } from '../db'
import { base64ToBytes } from '../lib/encoding'
import { assetPathFromSrc } from '../lib/paths'
import { credentials } from './auth'

const urls = new Map<string, Promise<string | null>>()

const MIME: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', svg: 'image/svg+xml' }

async function load(path: string): Promise<string | null> {
  const local = await db.assets.get(path)
  if (local) return URL.createObjectURL(local.blob)

  // Asset subido desde otro dispositivo: se descarga bajo demanda y se cachea en IndexedDB.
  const creds = credentials.value
  if (!creds || !navigator.onLine) return null
  const { GitHubClient } = await import('../github/client')
  const gh = new GitHubClient(creds)
  const sha = await gh.getFileSha(path)
  if (!sha) return null
  const mime = MIME[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
  const blob = new Blob([base64ToBytes(await gh.getBlob(sha))], { type: mime })
  await db.assets.put({ path, blob, mime, syncStatus: 'synced', remoteSha: sha, createdAt: new Date().toISOString() })
  return URL.createObjectURL(blob)
}

/** Resuelve el src de una imagen del Markdown a una URL mostrable (blob: para assets del repo). */
export function resolveImageSrc(src: string): Promise<string | null> {
  const path = assetPathFromSrc(src)
  if (!path) return Promise.resolve(src)
  let p = urls.get(path)
  if (!p) {
    p = load(path).catch((err) => {
      console.warn('[findegil] No se pudo cargar', path, err)
      return null
    })
    // Si falla (offline), permitir reintentar más tarde.
    p.then((u) => u === null && urls.delete(path))
    urls.set(path, p)
  }
  return p
}
