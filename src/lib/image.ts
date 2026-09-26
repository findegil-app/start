export interface CompressedImage {
  blob: Blob
  mime: string
  ext: string
}

/**
 * Redimensiona a un ancho máximo y convierte a WebP con la Canvas API.
 * Si el navegador no sabe codificar WebP (algunos Safari), cae a JPEG.
 */
export async function compressImage(file: Blob, maxWidth = 1920, quality = 0.82): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxWidth / bitmap.width)
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D no disponible')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const toBlob = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))

  let blob = await toBlob('image/webp')
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg')
  if (!blob) throw new Error('No se pudo comprimir la imagen')
  const mime = blob.type
  return { blob, mime, ext: mime === 'image/webp' ? 'webp' : 'jpg' }
}
