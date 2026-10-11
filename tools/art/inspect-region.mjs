/* 细看第二张图的头部：白色头发与白底之间到底有没有可分辨的边界 */
import fs from 'node:fs'
import jpeg from 'jpeg-js'

const img = jpeg.decode(fs.readFileSync(process.argv[2]), { useTArray: true, formatAsRGBA: true })
const { width: W, height: H, data } = img
const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]] }
const d = (x, y) => { const p = px(x, y); return Math.max(255 - p[0], 255 - p[1], 255 - p[2]) }

const x0 = Number(process.argv[3] || 0), y0 = Number(process.argv[4] || 0)
const x1 = Number(process.argv[5] || W), y1 = Number(process.argv[6] || H)
const CW = 100, CH = 44
console.log('=== 区域 x[' + x0 + ',' + x1 + ') y[' + y0 + ',' + y1 + ')  字符: 空格=<6  .=6-15  :=16-30  -=31-50  +>50 ===')
for (let r = 0; r < CH; r++) {
  let line = ''
  for (let c = 0; c < CW; c++) {
    const x = Math.round(x0 + (x1 - x0) * (c + 0.5) / CW)
    const y = Math.round(y0 + (y1 - y0) * (r + 0.5) / CH)
    const v = d(x, y)
    line += v < 6 ? ' ' : v < 16 ? '.' : v < 31 ? ':' : v < 51 ? '-' : '+'
  }
  console.log('  ' + line)
}
console.log('')
console.log('=== 几行原始像素值（每 4px 取一个，看白头发与白底是否真的都是 255） ===')
for (const y of [Number(process.argv[7] || 150), Number(process.argv[8] || 190), Number(process.argv[9] || 230)]) {
  let s = '  y=' + String(y).padStart(3) + ': '
  for (let x = x0; x < x1; x += 8) {
    const p = px(x, y)
    const v = Math.max(255 - p[0], 255 - p[1], 255 - p[2])
    s += (v < 10 ? '.' : String(v).padStart(3)) + ' '
  }
  console.log(s)
}