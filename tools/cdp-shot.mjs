import { writeFileSync } from 'node:fs'
const PORT = process.env.NP_PORT || '9222'
const out = process.argv[2] || 'shot.png'
const sel = process.argv[3] || ''
const wantMenu = process.argv.includes('--menu')
const fail = (m) => { console.log('  ✗ ' + m); process.exit(1) }

async function main() {
  const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json()
  const target = list.find((t) => t.url.includes('pet.html'))
  if (!target) return fail('找不到 pet.html 页面')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  })
  const send = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params: params || {} })) })

  await send('Page.enable')
  if (wantMenu) await send('Runtime.evaluate', { expression: 'if (!S.menuOpen) openMenu()' })
  let clip = null
  if (sel) {
    const r = await send('Runtime.evaluate', {
      expression: '(() => { const e = document.querySelector(' + JSON.stringify(sel) + '); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height } })()',
      returnByValue: true,
    })
    clip = r.result && r.result.result ? r.result.result.value : null
    if (!clip) return fail('找不到元素 ' + sel)
  }
  const params = { format: 'png' }
  if (clip) {
    params.clip = { x: Math.round(clip.x) - 4, y: Math.round(clip.y) - 4, width: Math.round(clip.width) + 8, height: Math.round(clip.height) + 8, scale: 1 }
    params.captureBeyondViewport = true
  }
  const shot = await send('Page.captureScreenshot', params)
  const data = shot.result && shot.result.data
  if (!data) return fail('截图失败')
  writeFileSync(out, Buffer.from(data, 'base64'))
  console.log('  ✓ ' + out + '  ' + (clip ? Math.round(clip.width) + 'x' + Math.round(clip.height) : '整窗口'))
  ws.close()
}
main().catch((e) => fail(e.message))
