/* 读出打包版 app.asar 里的文件清单，用来核对"包里到底装了什么"
 * 用法: node tools/asar-list.mjs <app.asar>
 * 例:   node tools/asar-list.mjs dist/win-unpacked/resources/app.asar
 * 提示: dist/win-unpacked 打完包可以删，需要核对时用 npm run dist:dir 再生成一次即可。
 */
import fs from 'node:fs'

const asar = process.argv[2]
if (!asar || !fs.existsSync(asar)) {
  console.log('用法: node tools/asar-list.mjs <app.asar>')
  process.exit(1)
}
const fd = fs.openSync(asar, 'r')
const head = Buffer.alloc(16)
fs.readSync(fd, head, 0, 16, 0)
const size = head.readUInt32LE(8)
const buf = Buffer.alloc(Math.max(size, 4))
fs.readSync(fd, buf, 0, buf.length, 16)
fs.closeSync(fd)

const raw = buf.toString('utf8')
let tree = null
for (let cut = raw.length; cut > 0; cut--) {
  if (raw[cut - 1] !== '}') continue
  try { tree = JSON.parse(raw.slice(0, cut)); break } catch (e) {}
}
if (!tree) { console.log('asar 头部解析失败'); process.exit(1) }

const rows = []
const walk = (node, prefix) => {
  for (const [name, v] of Object.entries(node.files || {})) {
    const p = prefix ? prefix + '/' + name : name
    if (v.files) walk(v, p)
    else rows.push([p, v.size || 0])
  }
}
walk(tree, '')
const kb = (n) => (n / 1024).toFixed(1) + ' KB'
console.log(asar + ' —— ' + rows.length + ' 个文件，' + kb(rows.reduce((a, r) => a + r[1], 0)))
for (const [p, s] of rows.sort()) console.log('  ' + p.padEnd(38) + kb(s).padStart(10))
const bad = rows.filter((r) => /test|spec|tools|docs|payload|\.mjs$|\.ps1$|README|CHANGELOG|立绘来源/i.test(r[0]))
console.log('')
console.log(bad.length ? '⚠ 不该出现的文件: ' + bad.map((r) => r[0]).join(', ') : '✓ 只有主代码，没有测试/工具/文档')
