// Genera los iconos PWA desde brand/: npm run icons
import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'

const rounded = 'public/logo.svg'
const square = 'brand/logo-square.svg'
const png = (src, size) => sharp(src, { density: 384 }).resize(size, size).png().toBuffer()

const jobs = [
  [rounded, 64, 'public/pwa-64x64.png'],
  [rounded, 192, 'public/pwa-192x192.png'],
  [rounded, 512, 'public/pwa-512x512.png'],
  // El SO aplica su propia máscara: versión a sangre.
  [square, 512, 'public/maskable-icon-512x512.png'],
  [square, 180, 'public/apple-touch-icon-180x180.png'],
]
for (const [src, size, out] of jobs) await writeFile(out, await png(src, size))

// favicon.ico con un PNG de 48px embebido (formato ICO moderno).
const img = await png(rounded, 48)
const header = Buffer.alloc(22)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(1, 4)
header.writeUInt8(48, 6)
header.writeUInt8(48, 7)
header.writeUInt16LE(1, 10)
header.writeUInt16LE(32, 12)
header.writeUInt32LE(img.length, 14)
header.writeUInt32LE(22, 18)
await writeFile('public/favicon.ico', Buffer.concat([header, img]))
console.log('Iconos generados')
