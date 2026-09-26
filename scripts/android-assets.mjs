// Iconos, splash e icono de notificación de la app Android desde brand/.  Uso: node scripts/android-assets.mjs
import sharp from 'sharp'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'

const RES = 'android/app/src/main/res'
const MIDNIGHT = '#0f1220'
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }

const markSvg = (await readFile('brand/mark.svg', 'utf8')).replace(/<title>.*?<\/title>/, '')
const mark = (color) => Buffer.from(markSvg.replaceAll('currentColor', color))
const square = await readFile('brand/logo-square.svg')

const png = (svg, size) => sharp(svg, { density: 512 }).resize(size, size).png().toBuffer()
async function out(dir, name, buf) {
  await mkdir(`${RES}/${dir}`, { recursive: true })
  await writeFile(`${RES}/${dir}/${name}`, buf)
}

for (const [d, k] of Object.entries(DENSITIES)) {
  const icon = Math.round(48 * k)
  // Legacy: cuadrado redondeado y redondo.
  const rounded = await sharp(await png(square, icon))
    .composite([{ input: Buffer.from(`<svg width="${icon}" height="${icon}"><rect width="${icon}" height="${icon}" rx="${icon * 0.22}"/></svg>`), blend: 'dest-in' }])
    .png()
    .toBuffer()
  const round = await sharp(await png(square, icon))
    .composite([{ input: Buffer.from(`<svg width="${icon}" height="${icon}"><circle cx="${icon / 2}" cy="${icon / 2}" r="${icon / 2}"/></svg>`), blend: 'dest-in' }])
    .png()
    .toBuffer()
  await out(`mipmap-${d}`, 'ic_launcher.png', rounded)
  await out(`mipmap-${d}`, 'ic_launcher_round.png', round)

  // Adaptativo: la pluma dentro de la zona segura (66 de 108 dp) sobre fondo medianoche.
  const fg = Math.round(108 * k)
  const inner = Math.round(fg * 0.62)
  const fgPng = await sharp({ create: { width: fg, height: fg, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await png(mark('#e3c27a'), inner), gravity: 'center' }])
    .png()
    .toBuffer()
  await out(`mipmap-${d}`, 'ic_launcher_foreground.png', fgPng)

  // Icono de notificación: silueta blanca (Android la tiñe con iconColor).
  await out(`drawable-${d}`, 'ic_stat_findegil.png', await png(mark('#ffffff'), Math.round(24 * k)))

  // Splash (Android < 12).
  for (const [orient, w, h] of [['port', 320, 480], ['land', 480, 320]]) {
    const W = Math.round(w * k)
    const H = Math.round(h * k)
    const splash = await sharp({ create: { width: W, height: H, channels: 3, background: MIDNIGHT } })
      .composite([{ input: await png(mark('#e3c27a'), Math.round(Math.min(W, H) * 0.34)), gravity: 'center' }])
      .png()
      .toBuffer()
    await out(`drawable-${orient}-${d}`, 'splash.png', splash)
    if (d === 'mdpi' && orient === 'port') await out('drawable', 'splash.png', splash)
  }
}

await writeFile(
  `${RES}/values/ic_launcher_background.xml`,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${MIDNIGHT}</color>\n</resources>\n`,
)
// El logo por defecto de Capacitor ya no se usa.
await rm(`${RES}/drawable-v24/ic_launcher_foreground.xml`, { force: true })
await rm(`${RES}/drawable/ic_launcher_background.xml`, { force: true })
console.log('Recursos Android generados')
