/* 用 Chromium（Electron 里的 ImageDecoder）把 GIF 拆成 PNG 帧
 * 用法: node tools/gifframes.mjs <gif路径(相对assets)> <输出目录>
 * 需要目标 app 已用 --remote-debugging-port=9222 启动
 */
import fs from 'node:fs'
import path from 'node:path'

const gifRel = process.argv[2]
const outDir = process.argv[3]
const port = process.argv[4] || 9222
fs.mkdirSync(outDir, { recursive: true })

const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()
const target = list.find((t) => t.url.includes('pet.html')) || list.find((t) => t.type === 'page')
if (!target) { console.log('没有找到可用的页面目标'); process.exit(1) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
let id = 0
function evaluate(expression) {
  const myId = ++id
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id !== myId) return
      ws.removeEventListener('message', onMsg)
      if (m.result && m.result.exceptionDetails) {
        reject(new Error((m.result.exceptionDetails.exception && m.result.exceptionDetails.exception.description) || 'eval error'))
      } else resolve(m.result && m.result.result ? m.result.result.value : null)
    }
    ws.addEventListener('message', onMsg)
    ws.send(JSON.stringify({ id: myId, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }))
  })
}

// 1) 建解码器
const info = JSON.parse(await evaluate(`(async () => {
  const r = await fetch(${JSON.stringify(gifRel)})
  const buf = await r.arrayBuffer()
  window.__dec = new ImageDecoder({ data: buf, type: 'image/gif' })
  await window.__dec.tracks.ready
  await window.__dec.completed
  if (!window.__dec.tracks.selectedTrack) window.__dec.tracks.selectedTrack = window.__dec.tracks[0]
  await window.__dec.tracks.ready
  const t = window.__dec.tracks.selectedTrack
  return JSON.stringify({ frames: t.frameCount, w: t.videoWidth, h: t.videoHeight, durations: [] })
})()`))
console.log('帧数 ' + info.frames + '  尺寸 ' + info.w + 'x' + info.h)

// 2) 逐帧导出
let total = 0
for (let i = 0; i < info.frames; i++) {
  const dataUrl = await evaluate(`(async () => {
    const { image } = await window.__dec.decode({ frameIndex: ${i} })
    const c = document.createElement('canvas')
    c.width = image.displayWidth; c.height = image.displayHeight
    c.getContext('2d').drawImage(image, 0, 0)
    return c.toDataURL('image/png')
  })()`)
  const b64 = String(dataUrl).split(',')[1]
  const buf = Buffer.from(b64, 'base64')
  const name = String(i).padStart(3, '0') + '.png'
  fs.writeFileSync(path.join(outDir, name), buf)
  total += buf.length
}
console.log('导出 ' + info.frames + ' 帧到 ' + outDir + '  合计 ' + Math.round(total / 1024) + 'KB')
fs.writeFileSync(path.join(outDir, '_frames.json'), JSON.stringify({ frames: info.frames, w: info.w, h: info.h, durations: info.durations }))
try { ws.close() } catch (e) { }
process.exit(0)