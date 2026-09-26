// Fuente del logo Findegil: pluma itálica (silueta plena + raquis en cuña + virola + plumín + puntas abiertas).
// Genera brand/*.svg y public/logo.svg:  node scripts/brand-src.mjs && npm run icons
import { writeFile } from 'node:fs/promises'

const MIDNIGHT = '#14182b'
const GOLD = '#e3c27a'
const PARCHMENT = '#f6f1e7'

const BODY =
  'M236 92 C284 80 352 78 400 84 C376 110 334 134 288 148 L240 162 L346 164 C322 198 284 226 240 248 ' +
  'L246 250 L243 360 L236 440 L229 360 L226 250 C192 212 186 142 236 92 Z'
const CUTS = [
  'M235 106 L238 106 L243 238 L229 238 Z', // raquis en cuña
  'M218 258 L254 258 L254 266 L218 266 Z', // virola
  'M234.5 384 L237.5 384 L236 426 Z', // ranura del plumín
  'M406 78 L340 114 L380 106 Z', // punta abierta, brazo superior
  'M352 158 L306 188 L330 188 Z', // punta abierta, brazo medio
]
// Itálica (skew -12°) centrada en el lienzo 512.
const transform = (scale) =>
  `translate(256 256) scale(${scale}) translate(-256 -256) translate(250 262) skewX(-12) translate(-256 -256) translate(-56 0)`

// scale: 1.04 en iconos redondeados; 0.8 a sangre para que el plumín quepa en la zona segura de iconos maskable.
const mark = (ink, scale = 1.04) =>
  `<mask id="cuts" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512"><rect width="512" height="512" fill="#fff"/>` +
  CUTS.map((d) => `<path d="${d}" fill="#000"/>`).join('') +
  `</mask><g transform="${transform(scale)}"><path d="${BODY}" fill="${ink}" mask="url(#cuts)"/></g>`

const svg = (inner, title = 'Findegil') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><title>${title}</title>${inner}</svg>\n`

await writeFile('public/logo.svg', svg(`<rect width="512" height="512" rx="112" fill="${MIDNIGHT}"/>${mark(GOLD)}`))
await writeFile('brand/logo-square.svg', svg(`<rect width="512" height="512" fill="${MIDNIGHT}"/>${mark(GOLD, 0.8)}`))
await writeFile('brand/logo-light.svg', svg(`<rect width="512" height="512" rx="112" fill="${PARCHMENT}"/>${mark(MIDNIGHT)}`))
// Marca sin fondo: los cortes son transparentes y el color hereda currentColor.
await writeFile('brand/mark.svg', svg(mark('currentColor')))
console.log('SVG de marca generados')
