/* 把图片转成字符画，便于在纯文本环境下判断主体轮廓与残留雾气 */
import fs from 'node:fs'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'

const CW = 78, CH = 34
function printMap(label, get, ramp) {
  console.log('\n=== ' + label + ' ===')
  for (let r = 0; r < CH; r++) {
    let line = ''
    for (let c = 0; c < CW; c++) {
      const v = get(c / (CW - 1), (r + 0.5) / CH)
      const idx = Math.max(0, Math.min(ramp.length - 1, Math.round(v * (ramp.length - 1))))
      line += ramp[idx]
    }
    console.log('  ' + line)
  }
}

const RAMP = ' .:-=+*#%@'
const [mode, file] = process.argv.slice(2)
if (mode === 'alpha') {
  const png = PNG.sync.read(fs.readFileSync(file))
  const { width: W, height: H, data } = png
  printMap(file + '  [alpha 通道: 空格=透明  @=不透明]', (u, v) => {
    const x = Math.min(W - 1, Math.floor(u * W)), y = Math.min(H - 1, Math.floor(v * H))
    const a = data[(y * W + x) * 4 + 3] / 255
    return a < 0.05 ? 0 : 0.25 + a * 0.75
  }, RAMP)
  // 顺带统计一下灰色残留区域的位置
  let mist = 0, mistTop = H, mistBot = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = data[(y * W + x) * 4 + 3]
    if (a > 10 && a < 250) { mist++; if (y < mistTop) mistTop = y; if (y > mistBot) mistBot = y }
  }
  console.log('  半透明像素纵向范围: y ' + mistTop + ' ~ ' + mistBot + ' (画布高 ' + H + ')')
} else {
  const img = jpeg.decode(fs.readFileSync(file), { useTArray: true, formatAsRGBA: true })
  const { width: W, height: H, data } = img
  printMap(file + '  [原图距白底距离: 空格=白底  @=深色主体]', (u, v) => {
    const x = Math.min(W - 1, Math.floor(u * W)), y = Math.min(H - 1, Math.floor(v * H))
    const i = (y * W + x) * 4
    const d = Math.max(255 - data[i], 255 - data[i + 1], 255 - data[i + 2])
    return Math.min(1, d / 160)
  }, RAMP)
}