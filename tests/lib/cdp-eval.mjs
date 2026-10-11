/* CDP 单次求值助手
 *   node tests/lib/cdp-eval.mjs "<表达式>"
 *   node tests/lib/cdp-eval.mjs @payloads/p-menu.js
 *   node tests/lib/cdp-eval.mjs state            （内置的窗口/立绘状态速览）
 *   NP_PORT=9223 node tests/lib/cdp-eval.mjs ...  （换调试端口）
 * 第三个参数是目标页（默认 pet.html，设置窗口传 settings.html）。
 * 表达式以 @ 开头时从文件读取 —— PowerShell 会吃掉内联字符串里的引号，所以一律用文件传。
 */
import { readFileSync } from 'node:fs'

const PORT = process.env.NP_PORT || '9222'
const STATE = `(() => {
  const pet = document.getElementById('pet')
  const r = pet.getBoundingClientRect()
  const img = document.getElementById('petImg')
  return {
    win: [Math.round(screenX), Math.round(screenY)],
    viewport: [innerWidth, innerHeight],
    anchor: pet.className.replace('pet ', ''),
    petOnScreen: [Math.round(screenX + r.x), Math.round(screenY + r.y), Math.round(r.width)],
    dpr: devicePixelRatio,
    avail: [screen.availWidth, screen.availHeight],
    mirrored: getComputedStyle(img).transform !== 'none'
  }
})()`

const exprArg = process.argv[2] || 'state'
let expr = exprArg
if (exprArg.startsWith('@')) expr = readFileSync(exprArg.slice(1), 'utf8').trim()
const page = process.argv[3] || 'pet.html'

const fail = (msg) => console.log('{"error":"' + String(msg).replace(/"/g, "'").slice(0, 300) + '"}')

async function main() {
  let list
  try {
    list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json()
  } catch (e) {
    fail('CDP 连不上 127.0.0.1:' + PORT + '（应用没带 --remote-debugging-port 启动？）')
    return
  }
  const target = list.find((t) => t.url.includes(page))
  if (!target) { fail('找不到目标页 ' + page); return }
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', rej)
  })
  const payload = expr === 'state' ? STATE : expr
  const msg = await new Promise((resolve) => {
    const onMsg = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id === 1) { ws.removeEventListener('message', onMsg); resolve(m) }
    }
    ws.addEventListener('message', onMsg)
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression: payload, returnByValue: true, awaitPromise: true },
    }))
  })
  try { ws.close() } catch (e) {}
  const ex = msg.result && msg.result.exceptionDetails
  if (ex) {
    fail((ex.exception && ex.exception.description) || 'eval failed')
    return
  }
  const v = msg.result && msg.result.result ? msg.result.result.value : null
  console.log(typeof v === 'string' ? v : JSON.stringify(v))
}

main().catch((e) => fail(e.message))