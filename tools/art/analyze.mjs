/* 分析两张原图：尺寸、边框颜色一致性、可抠图性评估 */
import fs from 'node:fs'
import jpeg from 'jpeg-js'

function analyze(file) {
  const raw = jpeg.decode(fs.readFileSync(file), { useTArray: true, formatAsRGBA: true })
  const { width: W, height: H, data } = raw
  const at = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]] }
  console.log('\n=== ' + file.split('\\').pop() + ' ===')
  console.log('尺寸: ' + W + ' x ' + H)

  const pts = [['左上', 2, 2], ['上中', W >> 1, 2], ['右上', W - 3, 2], ['左中', 2, H >> 1], ['右中', W - 3, H >> 1], ['左下', 2, H - 3], ['下中', W >> 1, H - 3], ['右下', W - 3, H - 3]]
  console.log('  边框取样: ' + pts.map(([n, x, y]) => n + '=rgb(' + at(x, y).join(',') + ')').join('  '))

  const ring = []
  const R = 3
  for (let x = 0; x < W; x++) for (let y = 0; y < R; y++) { ring.push(at(x, y)); ring.push(at(x, H - 1 - y)) }
  for (let y = 0; y < H; y++) for (let x = 0; x < R; x++) { ring.push(at(x, y)); ring.push(at(W - 1 - x, y)) }
  const mean = [0, 1, 2].map((c) => ring.reduce((s, p) => s + p[c], 0) / ring.length)
  const sd = [0, 1, 2].map((c) => Math.sqrt(ring.reduce((s, p) => s + (p[c] - mean[c]) ** 2, 0) / ring.length))
  console.log('  边框均值 rgb(' + mean.map((v) => Math.round(v)).join(',') + ')   标准差 ' + sd.map((v) => v.toFixed(1)).join(' / '))

  const hist = new Map()
  for (const p of ring) { const k = p.map((v) => v >> 4).join(','); hist.set(k, (hist.get(k) || 0) + 1) }
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
  console.log('  边框主色占比: ' + top.map(([k, v]) => '[' + k + '] ' + (v / ring.length * 100).toFixed(1) + '%').join('   '))

  // 从边框做洪水填充（容差 T），看能吃掉多少背景
  for (const T of [24, 40, 60]) {
    const visited = new Uint8Array(W * H)
    const stack = []
    const push = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return
      const id = y * W + x
      if (visited[id]) return
      const p = at(x, y)
      const d = Math.max(Math.abs(p[0] - mean[0]), Math.abs(p[1] - mean[1]), Math.abs(p[2] - mean[2]))
      if (d > T) return
      visited[id] = 1
      stack.push(x, y)
    }
    for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1) }
    for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y) }
    while (stack.length) {
      const y = stack.pop(); const x = stack.pop()
      push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1)
    }
    let n = 0, minX = W, minY = H, maxX = -1, maxY = -1
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (visited[y * W + x]) n++
      else { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y }
    }
    console.log('  容差 ' + T + ': 背景占比 ' + (n / (W * H) * 100).toFixed(1) + '%   前景包围盒 [' + minX + ',' + minY + ' → ' + maxX + ',' + maxY + ']  (' + (maxX - minX + 1) + 'x' + (maxY - minY + 1) + ')')
  }
}
for (const f of process.argv.slice(2)) analyze(f)