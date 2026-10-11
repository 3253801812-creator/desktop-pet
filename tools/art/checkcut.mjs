/* 抠图质量体检：半透明像素是不是"夹在透明与不透明之间"的正常抗锯齿带，还是白边光晕 */
import fs from 'node:fs'
import { PNG } from 'pngjs'

for (const file of process.argv.slice(2)) {
  const png = PNG.sync.read(fs.readFileSync(file))
  const { width: W, height: H, data } = png
  const A = (x, y) => data[(y * W + x) * 4 + 3]
  let semi = 0, nearWhite = 0, sandwiched = 0, farFromShape = 0
  let sr = 0, sg = 0, sb = 0
  const buckets = new Array(6).fill(0)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = A(x, y)
    if (a <= 10 || a >= 250) continue
    semi++
    buckets[Math.min(5, Math.floor((a - 10) / 40))]++
    const i = (y * W + x) * 4
    sr += data[i]; sg += data[i + 1]; sb += data[i + 2]
    if (Math.min(data[i], data[i + 1], data[i + 2]) > 200) nearWhite++
    let hasOpaque = false, hasEmpty = false
    for (let dy = -2; dy <= 2 && !(hasOpaque && hasEmpty); dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      const na = A(nx, ny)
      if (na > 250) hasOpaque = true
      if (na <= 10) hasEmpty = true
    }
    if (hasOpaque && hasEmpty) sandwiched++
    else if (!hasOpaque) farFromShape++
  }
  const pct = (n) => (n / Math.max(1, semi) * 100).toFixed(1) + '%'
  console.log('\n=== ' + file + ' ===')
  console.log('  半透明像素: ' + semi + '  平均色 rgb(' + Math.round(sr / semi) + ',' + Math.round(sg / semi) + ',' + Math.round(sb / semi) + ')')
  console.log('  偏白(最小通道>200)占比: ' + pct(nearWhite) + '   ← 高=可能有白边')
  console.log('  夹在透明与实心之间(正常抗锯齿带): ' + pct(sandwiched))
  console.log('  周围没有实心像素(孤立雾状/光晕): ' + pct(farFromShape) + '   ← 高=可能有雾气残留')
  console.log('  alpha 分布(10-50/50-90/90-130/130-170/170-210/210-250): ' + buckets.join(' / '))
}