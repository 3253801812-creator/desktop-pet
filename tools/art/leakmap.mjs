/* 抠图泄漏体检（按真实坐标对齐）
 * 用法: node tools/leakmap.mjs <原图.jpg> <抠图.png> [x0 y0 x1 y1]     —— 坐标是"原图坐标"
 * 依赖 cutout.mjs 写出的 <抠图.png>.meta.json 把输出像素映射回原图坐标
 * 判据：
 *   ❌泄漏 = 被删掉(alpha≈0) 但原图那里并不白(dist>25)  → 人物被吃掉
 *   ✓正确 = 被删掉且原图确实白
 *   ~羽化 = 半透明（正常抗锯齿带）
 */
import fs from 'node:fs'
import path from 'node:path'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'

/* 抠图参数现在统一记在 assets/立绘来源.json（原来每个 PNG 旁边一个 .meta.json，已合并）。
 * 这里按输出文件名查；查不到再退回旧的 <抠图.png>.meta.json 写法。 */
function readMeta(cutFile) {
  const name = path.basename(cutFile)
  const merged = path.join(path.dirname(cutFile), '立绘来源.json')
  if (fs.existsSync(merged)) {
    const all = JSON.parse(fs.readFileSync(merged, 'utf8'))
    const m = all[name]
    if (m) {
      return {
        src: m['原图'],
        srcW: m['原图尺寸'][0],
        srcH: m['原图尺寸'][1],
        bbox: m['裁切框'],
        scale: m['缩放'],
        ox: m['偏移'][0],
        oy: m['偏移'][1],
      }
    }
  }
  return JSON.parse(fs.readFileSync(cutFile + '.meta.json', 'utf8'))
}

const [srcFile, cutFile, ...rest] = process.argv.slice(2)
const meta = readMeta(cutFile)
const src = jpeg.decode(fs.readFileSync(srcFile), { useTArray: true, formatAsRGBA: true })
const cut = PNG.sync.read(fs.readFileSync(cutFile))
const W = src.width, H = src.height
const dist = (x, y) => { const i = (y * W + x) * 4; return Math.max(255 - src.data[i], 255 - src.data[i + 1], 255 - src.data[i + 2]) }
// 输出坐标(px,py) → 原图坐标
const toSrc = (px, py) => {
  const sx = meta.bbox.minX + (px - meta.ox) / meta.scale
  const sy = meta.bbox.minY + (py - meta.oy) / meta.scale
  return [sx, sy]
}

const x0 = Number(rest[0] ?? 0), y0 = Number(rest[1] ?? 0)
const x1 = Number(rest[2] ?? W), y1 = Number(rest[3] ?? H)

// 遍历原图区域，反查输出像素
let leak = 0, bg = 0, semi = 0, kept = 0, white = 0
const grid = new Map()
const CW = 100, CH = 42
for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
  for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
    const px = Math.round(meta.ox + (x - meta.bbox.minX) * meta.scale)
    const py = Math.round(meta.oy + (y - meta.bbox.minY) * meta.scale)
    const inside = px >= 0 && py >= 0 && px < meta.size && py < meta.size
    const al = inside ? cut.data[(py * meta.size + px) * 4 + 3] : 0
    const d = dist(x, y)
    let mark
    if (al <= 5) { if (d > 25) { leak++; mark = 'X' } else { bg++; mark = ' ' } }
    else if (al < 250) { semi++; mark = '~' }
    else { kept++; if (d <= 12) { white++; mark = 'o' } else mark = '+' }
    if (rest.length) {
      const c = Math.min(CW - 1, Math.floor((x - x0) / (x1 - x0) * CW))
      const r = Math.min(CH - 1, Math.floor((y - y0) / (y1 - y0) * CH))
      const k = r * CW + c
      if (!grid.has(k) || grid.get(k) === ' ') grid.set(k, mark)
    }
  }
}
if (rest.length) {
  console.log('区域 x[' + x0 + ',' + x1 + ') y[' + y0 + ',' + y1 + ')   (原图坐标)')
  console.log('空格=正确删掉的白底   X=❌把人物删了   ~=半透明羽化   +=保留')
  for (let r = 0; r < CH; r++) {
    let line = ''
    for (let c = 0; c < CW; c++) line += grid.get(r * CW + c) || ' '
    console.log('  ' + line)
  }
  console.log('')
}
const totalNonBg = leak + semi + kept
console.log('  原图 ' + W + 'x' + H + '   抠图 ' + meta.size + '  容差 ' + meta.tol + '  缩放 ' + meta.scale.toFixed(3))
console.log('  正确删白底 ' + bg + '   ❌泄漏 ' + leak + '   羽化 ' + semi + '   保留 ' + kept + '   其中"保留但很白" ' + white)
console.log('  泄漏率 = ' + (leak / totalNonBg * 100).toFixed(2) + '%   (越低越好)')
console.log('  很白残留率 = ' + (white / totalNonBg * 100).toFixed(2) + '%   (里面既有真白头发，也可能是白底残留，看下面的分布图)')