/* ===========================================================================
 * 抠图工具：白底 JPEG → 透明 PNG
 *   node tools/cutout.mjs <in.jpg> <out.png> [--tol=40] [--size=512] [--preview=xxx]
 * 做法：
 *   1. 从边框环稳健估计背景色（取众数附近均值）
 *   2. 从边框做洪水填充（容差 tol），只吃与边框连通的背景 —— 主体内部的白色不会被误伤
 *   3. 边缘 1~2px 用"距离→alpha"做羽化，并按 alpha 反预乘还原前景色，避免白边
 *   4. 按主体包围盒裁剪 → 等比缩放 → 放进方形画布（宽度居中、底部对齐），两张图框一致
 *   5. 顺带输出预览图（棋盘格 / 品红底），方便肉眼检查有没有残留背景或白边
 * =========================================================================== */
import fs from 'node:fs'
import path from 'node:path'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'

const args = process.argv.slice(2)
const pos = args.filter((a) => !a.startsWith('--'))
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=')
  return [k, v === undefined ? true : v]
}))
const [inFile, outFile] = pos
if (!inFile || !outFile) { console.error('用法: node tools/cutout.mjs <in.jpg> <out.png> [--tol=40] [--size=512] [--preview=path]'); process.exit(1) }
const TOL = Number(opt.tol || 40)
const SIZE = Number(opt.size || 512)

const img = jpeg.decode(fs.readFileSync(inFile), { useTArray: true, formatAsRGBA: true })
const W = img.width
const H = img.height
const src = img.data
const px = (x, y) => { const i = (y * W + x) * 4; return [src[i], src[i + 1], src[i + 2]] }
const dist = (p, q) => Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]), Math.abs(p[2] - q[2]))

/* ---- 1. 稳健估计背景色 ---- */
const ring = []
const R = 3
for (let x = 0; x < W; x++) for (let y = 0; y < R; y++) { ring.push(px(x, y)); ring.push(px(x, H - 1 - y)) }
for (let y = 0; y < H; y++) for (let x = 0; x < R; x++) { ring.push(px(x, y)); ring.push(px(W - 1 - x, y)) }
const bins = new Map()
for (const p of ring) { const k = p.map((v) => v >> 3).join(','); if (!bins.has(k)) bins.set(k, []); bins.get(k).push(p) }
const modeBin = [...bins.values()].sort((a, b) => b.length - a.length)[0]
const bg = [0, 1, 2].map((c) => modeBin.reduce((s, p) => s + p[c], 0) / modeBin.length)
console.log('背景色估计: rgb(' + bg.map((v) => Math.round(v)).join(',') + ')   众数样本 ' + modeBin.length + '/' + ring.length)

/* ---- 2. 洪水填充（只吃与边框连通的背景） ---- */
const isBg = new Uint8Array(W * H)
const stack = []
const seed = (x, y) => {
  const id = y * W + x
  if (isBg[id]) return
  if (dist(px(x, y), bg) > TOL) return
  isBg[id] = 1
  stack.push(x, y)
}
for (let x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1) }
for (let y = 0; y < H; y++) { seed(0, y); seed(W - 1, y) }
while (stack.length) {
  const y = stack.pop(); const x = stack.pop()
  if (x > 0) seed(x - 1, y)
  if (x < W - 1) seed(x + 1, y)
  if (y > 0) seed(x, y - 1)
  if (y < H - 1) seed(x, y + 1)
}
let bgCount = 0
for (let i = 0; i < W * H; i++) if (isBg[i]) bgCount++
console.log('背景占比: ' + (bgCount / (W * H) * 100).toFixed(1) + '%')

/* ---- 3. alpha + 边缘羽化 + 反预乘 ---- */
const T2 = 130
const alpha = new Float32Array(W * H)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const id = y * W + x
  if (isBg[id]) { alpha[id] = 0; continue }
  // 距背景区 <=2px 的像素做半透明过渡
  let nearBg = false
  for (let dy = -2; dy <= 2 && !nearBg; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = x + dx, ny = y + dy
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
    if (isBg[ny * W + nx]) { nearBg = true; break }
  }
  if (!nearBg) { alpha[id] = 1; continue }
  const d = dist(px(x, y), bg)
  const a = Math.min(1, Math.max(0, (d - TOL * 0.55) / (T2 - TOL * 0.55)))
  alpha[id] = a < 0.12 ? 0 : a
}
const rgba = Buffer.alloc(W * H * 4)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const id = y * W + x
  const i = id * 4
  const a = alpha[id]
  rgba[i + 3] = Math.round(a * 255)
  if (a >= 0.15) {
    // 反预乘：观察色 = a*F + (1-a)*bg  →  F = (C - (1-a)*bg)/a
    for (let c = 0; c < 3; c++) {
      const v = (src[i + c] - (1 - a) * bg[c]) / a
      rgba[i + c] = Math.min(255, Math.max(0, Math.round(v)))
    }
  } else {
    rgba[i] = src[i]; rgba[i + 1] = src[i + 1]; rgba[i + 2] = src[i + 2]
  }
}

/* ---- 4. 裁到主体包围盒 → 缩放 → 方画布（底部对齐、按高度归一） ---- */
let minX = W, minY = H, maxX = -1, maxY = -1
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (alpha[y * W + x] > 0.06) { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y }
}
const bw = maxX - minX + 1
const bh = maxY - minY + 1
console.log('主体包围盒: [' + minX + ',' + minY + ' → ' + maxX + ',' + maxY + ']  ' + bw + 'x' + bh)

const usable = SIZE * 0.92
let scale = (SIZE * 0.90) / bh              // 按高度归一，两张图观感一致
if (bw * scale > usable) scale = usable / bw
const dw = Math.max(1, Math.round(bw * scale))
const dh = Math.max(1, Math.round(bh * scale))
const ox = Math.round((SIZE - dw) / 2)
const oy = SIZE - dh - Math.round(SIZE * 0.02)   // 底部留 2%

// 带 alpha 的盒式/双线性缩放（用预乘 alpha，避免边缘发黑）
const out = Buffer.alloc(SIZE * SIZE * 4)
function sampleBox(sx0, sy0, sx1, sy1) {
  let r = 0, g = 0, b = 0, a = 0, n = 0
  for (let y = Math.max(0, Math.floor(sy0)); y < Math.min(H, Math.ceil(sy1)); y++) {
    for (let x = Math.max(0, Math.floor(sx0)); x < Math.min(W, Math.ceil(sx1)); x++) {
      const i = (y * W + x) * 4
      const al = rgba[i + 3] / 255
      r += rgba[i] * al; g += rgba[i + 1] * al; b += rgba[i + 2] * al; a += al; n++
    }
  }
  if (!n || a === 0) return [0, 0, 0, 0]
  return [r / a, g / a, b / a, a / n]
}
for (let dy2 = 0; dy2 < dh; dy2++) for (let dx2 = 0; dx2 < dw; dx2++) {
  const sx0 = minX + dx2 / scale
  const sy0 = minY + dy2 / scale
  const sx1 = minX + (dx2 + 1) / scale
  const sy1 = minY + (dy2 + 1) / scale
  const [r, g, b, a] = sampleBox(sx0, sy0, sx1, sy1)
  const o = ((oy + dy2) * SIZE + (ox + dx2)) * 4
  out[o] = Math.min(255, Math.round(r))
  out[o + 1] = Math.min(255, Math.round(g))
  out[o + 2] = Math.min(255, Math.round(b))
  out[o + 3] = Math.min(255, Math.round(a * 255))
}

const png = new PNG({ width: SIZE, height: SIZE })
png.data = out
fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, PNG.sync.write(png))
// 记录裁剪/缩放参数，供体检脚本把输出坐标还原回原图坐标
fs.writeFileSync(outFile + '.meta.json', JSON.stringify({
  src: inFile, srcW: W, srcH: H, bbox: { minX, minY, bw, bh }, scale, ox, oy, size: SIZE, tol: TOL,
}, null, 0))
console.log('输出: ' + outFile + '  ' + SIZE + 'x' + SIZE + '  ' + Math.round(fs.statSync(outFile).size / 1024) + 'KB')

/* ---- 5. 自动体检：四条画布边缘应几乎全透明 ---- */
let edgeOpaque = 0
for (let x = 0; x < SIZE; x++) { if (out[(0 * SIZE + x) * 4 + 3] > 10) edgeOpaque++; if (out[((SIZE - 1) * SIZE + x) * 4 + 3] > 10) edgeOpaque++ }
for (let y = 0; y < SIZE; y++) { if (out[(y * SIZE + 0) * 4 + 3] > 10) edgeOpaque++; if (out[(y * SIZE + SIZE - 1) * 4 + 3] > 10) edgeOpaque++ }
let opaque = 0, semi = 0
for (let i = 3; i < out.length; i += 4) { if (out[i] > 250) opaque++; else if (out[i] > 10) semi++ }
console.log('体检: 画布边缘不透明像素 ' + edgeOpaque + ' 个（应≈0）   主体实心像素 ' + (opaque / (SIZE * SIZE) * 100).toFixed(1) + '%   半透明边缘 ' + semi + ' 个')

/* ---- 6. 预览图 ---- */
if (opt.preview) {
  for (const [tag, fill] of [['checker', null], ['magenta', [255, 0, 180]]]) {
    const p = new PNG({ width: SIZE, height: SIZE })
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4
      let br
      if (fill) br = fill
      else br = ((x >> 4) + (y >> 4)) % 2 ? [200, 200, 205] : [255, 255, 255]
      const a = out[i + 3] / 255
      p.data[i] = Math.round(out[i] * a + br[0] * (1 - a))
      p.data[i + 1] = Math.round(out[i + 1] * a + br[1] * (1 - a))
      p.data[i + 2] = Math.round(out[i + 2] * a + br[2] * (1 - a))
      p.data[i + 3] = 255
    }
    const f = opt.preview.replace(/\.png$/, '') + '-' + tag + '.png'
    fs.writeFileSync(f, PNG.sync.write(p))
    console.log('预览: ' + f)
  }
}