/* 用 CDP 截屏两次，比较屏幕上是否真的在变化
 * 用法: node tools/shotdiff.mjs [间隔ms] [端口]
 */
import fs from 'node:fs'
import { PNG } from 'pngjs'

const gap = Number(process.argv[2] || 400)
const port = Number(process.argv[3] || 9222)

const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()
const target = list.find((t) => t.url.includes('pet.html')) || list.find((t) => t.type === 'page')
if (!target) { console.log('没找到页面目标'); process.exit(1) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
let id = 0
const waiters = new Map()
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && waiters.has(m.id)) { const w = waiters.get(m.id); waiters.delete(m.id); w(m) }
})
function send(method, params = {}) {
  const myId = ++id
  return new Promise((resolve) => {
    waiters.set(myId, resolve)
    ws.send(JSON.stringify({ id: myId, method, params }))
  })
}
await send('Page.enable')
async function shot() {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  return PNG.sync.read(Buffer.from(r.result.data, 'base64'))
}
const a = await shot()
await new Promise((r) => setTimeout(r, gap))
const b = await shot()
let diff = 0, maxd = 0
for (let k = 0; k < a.data.length; k += 4) {
  const d = Math.abs(a.data[k] - b.data[k]) + Math.abs(a.data[k + 1] - b.data[k + 1]) + Math.abs(a.data[k + 2] - b.data[k + 2])
  if (d > 12) diff++
  if (d > maxd) maxd = d
}
console.log('  截图 ' + a.width + 'x' + a.height + '   间隔 ' + gap + 'ms')
console.log('  屏幕变化像素 ' + diff + ' / ' + (a.width * a.height) + '   最大差 ' + maxd)
console.log('  结论: ' + (diff > 500 ? '屏幕上的画面确实在动（GIF 在播放）' : '屏幕画面没有变化（GIF 没在播放）'))
fs.writeFileSync(process.env.TEMP + '\\pet-shot-a.png', PNG.sync.write(a))
fs.writeFileSync(process.env.TEMP + '\\pet-shot-b.png', PNG.sync.write(b))
try { ws.close() } catch (e) { }
process.exit(0)