/* 轻量 GIF 结构扫描：尺寸、帧数、是否声明透明色、每帧延时、调色板大小 */
import fs from 'node:fs'

function scan(file) {
  const b = fs.readFileSync(file)
  const sig = b.toString('ascii', 0, 6)
  const W = b.readUInt16LE(6), H = b.readUInt16LE(8)
  const packed = b[10]
  const gctFlag = (packed & 0x80) ? 1 : 0
  const gctSize = gctFlag ? 3 * (1 << ((packed & 7) + 1)) : 0
  const bgIndex = b[11]
  let p = 13 + gctSize
  const frames = []
  let transparentFrames = 0
  let disposed = {}
  while (p < b.length) {
    const blk = b[p]
    if (blk === 0x3B) break                      // trailer
    if (blk === 0x21) {                          // extension
      const label = b[p + 1]
      if (label === 0xF9) {                      // graphic control extension
        const size = b[p + 2]
        const flags = b[p + 3]
        const delay = b.readUInt16LE(p + 4)
        const tIndex = b[p + 6]
        const hasT = (flags & 1) === 1
        frames.push({ delay: delay * 10, transparent: hasT, tIndex, disposal: (flags >> 2) & 7 })
        if (hasT) transparentFrames++
        p += 3 + size
        while (b[p] !== 0) p += b[p] + 1
        p += 1
        continue
      }
      p += 2
      while (b[p] !== 0) p += b[p] + 1
      p += 1
      continue
    }
    if (blk === 0x2C) {                          // image descriptor
      const lp = b[p + 9]
      const lctSize = (lp & 0x80) ? 3 * (1 << ((lp & 7) + 1)) : 0
      p += 10 + lctSize
      p += 1                                     // LZW min code size
      while (b[p] !== 0) p += b[p] + 1
      p += 1
      continue
    }
    break
  }
  const total = frames.reduce((s, f) => s + f.delay, 0)
  for (const f of frames) disposed[f.disposal] = (disposed[f.disposal] || 0) + 1
  console.log('=== ' + file + ' ===')
  console.log('  签名 ' + sig + '   画布 ' + W + 'x' + H + '   全局调色板 ' + (gctFlag ? (1 << ((packed & 7) + 1)) + ' 色' : '无') + '   背景色索引 ' + bgIndex)
  console.log('  帧数 ' + frames.length + '   声明透明色的帧 ' + transparentFrames + '/' + frames.length)
  console.log('  帧延时(ms) ' + frames.map((f) => f.delay).slice(0, 12).join(',') + (frames.length > 12 ? ' …' : ''))
  console.log('  整循环时长 ' + total + 'ms')
  console.log('  处置方式分布 ' + JSON.stringify(disposed) + '  (2=恢复背景 1=不处置 3=恢复上一帧)')
  console.log('  文件大小 ' + Math.round(b.length / 1024) + 'KB')
  return { W, H, frames: frames.length }
}
for (const f of process.argv.slice(2)) scan(f)