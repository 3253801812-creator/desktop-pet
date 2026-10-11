/* 彩色字符图：直接把区域的平均 RGB 打出来，判断"被吃掉的那片"到底是什么内容 */
import fs from 'node:fs'
import jpeg from 'jpeg-js'

const img = jpeg.decode(fs.readFileSync(process.argv[2]), { useTArray: true, formatAsRGBA: true })
const { width: W, height: H, data } = img
const x0 = Number(process.argv[3] || 0), y0 = Number(process.argv[4] || 0)
const x1 = Number(process.argv[5] || W), y1 = Number(process.argv[6] || H)
const CW = Number(process.argv[7] || 40), CH = Number(process.argv[8] || 24)

console.log('区域 x[' + x0 + ',' + x1 + ') y[' + y0 + ',' + y1 + ')   网格 ' + CW + 'x' + CH)
console.log('每格显示平均色。255,255,255=白底   其它=内容')
for (let r = 0; r < CH; r++) {
  let line = ''
  for (let c = 0; c < CW; c++) {
    let R = 0, G = 0, B = 0, n = 0
    const sx0 = Math.round(x0 + (x1 - x0) * c / CW), sx1 = Math.round(x0 + (x1 - x0) * (c + 1) / CW)
    const sy0 = Math.round(y0 + (y1 - y0) * r / CH), sy1 = Math.round(y0 + (y1 - y0) * (r + 1) / CH)
    for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) {
      const i = (y * W + x) * 4
      R += data[i]; G += data[i + 1]; B += data[i + 2]; n++
    }
    R = Math.round(R / n); G = Math.round(G / n); B = Math.round(B / n)
    const hex = ((R << 16) | (G << 8) | B).toString(16).padStart(6, '0')
    // 用字符表示亮度档，再附 hex 便于精确判断
    const lum = (R + G + B) / 3
    const ch = lum > 250 ? 'W' : lum > 240 ? 'w' : lum > 225 ? 'l' : lum > 200 ? 'm' : lum > 150 ? 'd' : 'D'
    line += ch
  }
  console.log('  ' + line)
}
console.log('图例: W=>250  w=240-250  l=225-240  m=200-225  d=150-200  D=<150')
console.log('')
console.log('关键格子的原始 RGB（左上起，每 4 格取一个）:')
for (let r = 0; r < CH; r += 4) {
  let s = ''
  for (let c = 0; c < CW; c += 4) {
    let R = 0, G = 0, B = 0, n = 0
    const sx0 = Math.round(x0 + (x1 - x0) * c / CW), sx1 = Math.round(x0 + (x1 - x0) * (c + 4) / CW)
    const sy0 = Math.round(y0 + (y1 - y0) * r / CH), sy1 = Math.round(y0 + (y1 - y0) * (r + 4) / CH)
    for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) { const i = (y * W + x) * 4; R += data[i]; G += data[i + 1]; B += data[i + 2]; n++ }
    s += '(' + Math.round(R / n) + ',' + Math.round(G / n) + ',' + Math.round(B / n) + ') '
  }
  console.log('  y~' + Math.round(y0 + (y1 - y0) * r / CH) + ': ' + s)
}