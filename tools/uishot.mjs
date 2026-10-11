/* ===========================================================================
 * 给任意窗口截一张图，并打印两张「看得懂」的文字版布局图：
 *   1) 墨色图：深色像素 = 有内容（文字/边框/控件）
 *   2) 边缘图：只保留相邻像素差异大的地方 —— 卡片边框、输入框、按钮会浮出来
 * 用法: node tools/uishot.mjs [页面关键字] [输出png]
 *   node tools/uishot.mjs settings.html docs/preview/settings-window.png
 * =========================================================================== */
import fs from 'node:fs'
import { PNG } from 'pngjs'

const pageKey = process.argv[2] || 'settings.html'
const outPng = process.argv[3] || ''
const port = Number(process.env.NP_PORT || 9222)
const COLS = Number(process.env.NP_COLS || 104)

const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()
const target = list.find((t) => t.url.includes(pageKey))
if (!target) { console.log('没找到页面目标: ' + pageKey + '（现有: ' + list.map((t) => t.url.split('/').pop()).join(', ') + '）'); process.exit(1) }

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
let id = 0
const waiters = new Map()
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  const w = waiters.get(m.id)
  if (w) { waiters.delete(m.id); w(m) }
})
const send = (method, params) => new Promise((res) => { const i = ++id; waiters.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })

await send('Page.enable', {})
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
const b64 = shot.result && shot.result.data
if (!b64) { console.log('截图失败: ' + JSON.stringify(shot).slice(0, 200)); process.exit(1) }
const buf = Buffer.from(b64, 'base64')
const png = PNG.sync.read(buf)
if (outPng) { fs.writeFileSync(outPng, buf); console.log('已保存截图: ' + outPng + '  (' + png.width + 'x' + png.height + ')') }

/* 亮度图（0=黑 1=白） */
const W = png.width, H = png.height
const lum = new Float32Array(W * H)
for (let i = 0; i < W * H; i++) {
  const o = i * 4
  lum[i] = (0.299 * png.data[o] + 0.587 * png.data[o + 1] + 0.114 * png.data[o + 2]) / 255
}

/* 块平均降采样 */
const ROWS = Math.max(8, Math.round(COLS * (H / W) * 0.5))   // 字符高约为宽的一半
const bw = W / COLS, bh = H / ROWS
const small = []
for (let r = 0; r < ROWS; r++) {
  const line = []
  for (let c = 0; c < COLS; c++) {
    let s = 0, n = 0
    for (let y = Math.floor(r * bh); y < Math.min(H, Math.floor((r + 1) * bh)); y++) {
      for (let x = Math.floor(c * bw); x < Math.min(W, Math.floor((c + 1) * bw)); x++) { s += lum[y * W + x]; n++ }
    }
    line.push(n ? s / n : 1)
  }
  small.push(line)
}

const RAMP = ' .:-=+*#%@'   // 浅 → 深（页面底色浅，所以文字会显示成深字符）
let out = '\n=== 墨色图 ' + pageKey + ' (' + W + 'x' + H + ' → ' + COLS + 'x' + ROWS + ') ===\n'
for (let r = 0; r < ROWS; r++) {
  let s = ''
  for (let c = 0; c < COLS; c++) {
    const v = small[r][c]
    s += RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.round((1 - v) * (RAMP.length - 1))))]
  }
  out += s.replace(/\s+$/, '') + '\n'
}
console.log(out)

/* 墨点图：块内只要有深一点儿的像素就画一个 # —— 文字行/按钮/输入框会连成条带，
 * 一眼能看出「哪块有东西、哪块空着、有没有被切掉」 */
{
  const RC = COLS, RR = Math.max(10, Math.round(COLS * (H / W) * 0.5))
  const cw = W / RC, chh = H / RR
  let s = '\n=== 墨点图（# = 这块有内容）' + RC + 'x' + RR + ' ===\n'
  for (let r = 0; r < RR; r++) {
    let line = ''
    for (let c = 0; c < RC; c++) {
      let ink = 0
      for (let y = Math.floor(r * chh); y < Math.min(H, Math.floor((r + 1) * chh)); y++) {
        for (let x = Math.floor(c * cw); x < Math.min(W, Math.floor((c + 1) * cw)); x++) {
          if (lum[y * W + x] < 0.86) ink++
        }
      }
      const dens = ink / Math.max(1, Math.floor(cw) * Math.floor(chh))
      line += dens > 0.35 ? '#' : (dens > 0.10 ? '+' : (dens > 0.02 ? '.' : ' '))
    }
    s += line.replace(/\s+$/, '') + '\n'
  }
  console.log(s)
}

let edge = '\n=== 边缘图（卡片/输入框/按钮的轮廓）===\n'
for (let r = 0; r < ROWS; r++) {
  let s = ''
  for (let c = 0; c < COLS; c++) {
    const v = small[r][c]
    const vr = c + 1 < COLS ? small[r][c + 1] : v
    const vd = r + 1 < ROWS ? small[r + 1][c] : v
    const d = Math.abs(v - vr) + Math.abs(v - vd)
    s += d > 0.20 ? '#' : (d > 0.08 ? '+' : (v < 0.72 ? '.' : ' '))
  }
  edge += s.replace(/\s+$/, '') + '\n'
}
console.log(edge)
try { ws.close() } catch (e) {}