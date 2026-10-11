/* 看一帧 PNG 的外形（每行不透明范围）与颜色 */
import fs from 'node:fs'
import { PNG } from 'pngjs'

for (const [name, file] of [['GIF-1', process.argv[2]], ['GIF-2', process.argv[3]]]) {
  if (!file || !fs.existsSync(file)) { console.log('缺文件 ' + file); continue }
  const p = PNG.sync.read(fs.readFileSync(file))
  console.log('=== ' + name + '  帧0  ' + p.width + 'x' + p.height + ' ===')
  const rows = []
  for (let y = 0; y < p.height; y++) {
    let a = -1, b = -1
    for (let x = 0; x < p.width; x++) if (p.data[(y * p.width + x) * 4 + 3] > 8) { if (a < 0) a = x; b = x }
    rows.push([a, b])
  }
  const pick = [0, 2, 5, 10, 20, 40, 80, 120, 160, 200, 249, 300, 400, 460, 480, 494, 497, 499]
  for (const y of pick) console.log('   y=' + String(y).padStart(3) + '   不透明 x ∈ [' + rows[y][0] + ',' + rows[y][1] + ']')
  const px = (x, y) => { const i = (y * p.width + x) * 4; return p.data[i] + ',' + p.data[i + 1] + ',' + p.data[i + 2] + ',' + p.data[i + 3] }
  console.log('   中心 ' + px(250, 250) + '   左中 ' + px(3, 250) + '   上中 ' + px(250, 3) + '   左上 ' + px(3, 3))
  // 半透明与全透明的像素数
  let s = 0, c = 0, o = 0
  for (let i = 3; i < p.data.length; i += 4) { const a = p.data[i]; if (a > 250) o++; else if (a > 8) s++; else c++ }
  const n = p.width * p.height
  console.log('   不透明 ' + (o / n * 100).toFixed(1) + '%   半透明 ' + (s / n * 100).toFixed(2) + '%   全透明 ' + (c / n * 100).toFixed(1) + '%')
}