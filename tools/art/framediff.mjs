/* 比较同一 GIF 导出的各帧之间是否真的有差别 */
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

const dir = process.argv[2]
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort()
const frames = files.map((f) => PNG.sync.read(fs.readFileSync(path.join(dir, f))))
console.log('=== ' + dir + '  共 ' + frames.length + ' 帧 ===')
let anyDiff = false
for (let i = 1; i < frames.length; i++) {
  const a = frames[i - 1].data, b = frames[i].data
  let diff = 0, maxd = 0
  for (let k = 0; k < a.length; k += 4) {
    const d = Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]) + Math.abs(a[k + 3] - b[k + 3])
    if (d > 12) diff++
    if (d > maxd) maxd = d
  }
  if (diff > 0) anyDiff = true
  if (i <= 12 || diff > 0) console.log('  帧 ' + (i - 1) + ' -> ' + i + ' :  变化像素 ' + diff + '  最大差 ' + maxd)
}
// 首帧与末帧
const f0 = frames[0].data, fN = frames[frames.length - 1].data
let d0 = 0
for (let k = 0; k < f0.length; k += 4) if (Math.abs(f0[k] - fN[k]) + Math.abs(f0[k + 1] - fN[k + 1]) + Math.abs(f0[k + 2] - fN[k + 2]) > 12) d0++
console.log('  首帧 vs 末帧 :  变化像素 ' + d0)
console.log('  结论: ' + (anyDiff || d0 > 0 ? '帧与帧之间确实有变化（真动画）' : '所有帧几乎完全一样（实际是静态图）'))