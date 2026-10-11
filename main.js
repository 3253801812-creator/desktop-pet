/**
 * 桌面记事本桌宠 · Electron 主进程
 * ---------------------------------------------------------------------------
 * · 一个透明、无边框、置顶、不占任务栏的「桌宠窗口」，常驻整个电脑桌面
 *   （鼠标穿透：只有宠物/气泡/菜单这些实体区域接收点击，透明区域把点击还给桌面）
 * · 拖拽由主进程接管（用真实光标坐标移动窗口），松手后吸附到屏幕工作区边缘
 * · 右侧菜单 + 独立设置窗口；时段任务到点弹气泡 + 响铃 + Windows 系统通知
 * · 数据落盘在 userData：settings.json / tasks.json / window.json
 */
'use strict'
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, Notification, nativeImage } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

// 打包后 userData 默认会跟着 productName 变成中文目录，这里固定住：开发态与打包态共用同一份数据
// 例外：自动化测试用 NOTEPAD_PET_USERDATA 指到临时目录，绝不碰你的真实数据
try { app.setPath('userData', process.env.NOTEPAD_PET_USERDATA || path.join(app.getPath('appData'), 'notepad-pet-app')) } catch (err) {}

const WIN_W = 660
const WIN_H = 540
/* 宠物基准边长（逻辑像素）——必须与 renderer/pet.js 的 PET_BASE、pet.css 的 #pet 尺寸保持一致 */
const PET_BASE = 150
const PET_MARGIN = 6        // 宠物离窗口边缘的留白（与 pet.css 里的 6px 保持一致）
const ANCHORS = ['br', 'bl', 'tr', 'tl']   // 只接受这 4 个角，坏数据一律回退

let petWin = null
let settingsWin = null
let tray = null
let dragState = null
let anchor = 'br'
let lastAutoStart = null

/* ============================ 数据层 ============================ */
const DATA_DIR = app.getPath('userData')
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json')
const POS_FILE = path.join(DATA_DIR, 'window.json')
const ALARM_FILE = path.join(DATA_DIR, 'alarm.json')   // 闹钟/计时排期（重启后还能接着倒计时）

const DEFAULT_SETTINGS = {
  scale: 1,
  vol: 0.8,
  soundOn: true,
  soundSet: 'duck',      // duck | fx1
  remindSound: 'orb',    // orb | a | none
  bubbleOn: true,
  bubbleSec: 6,
  snoozeMin: 5,          // 「XX 分钟后提醒」默认分钟数
  character: 'skadi',    // 形象：skadi = 斯卡蒂 / xiaote = 小特 / mumu = 缪缪（双形态与否看 pet.js 的 FORMS）
  autoStart: false,      // 默认开机不自启（想自启在设置里自行打开）
  snapOn: true,
  alwaysOnTop: true,
  notifyOn: true,        // 到点发 Windows 系统通知
  petVisible: true,
  tipEmptyShown: false,  // 「还没有日程」的友好提示只飘一次，看过就不再打扰
}

/* 示例任务：默认**不**写入日程。只有用户在设置窗口里点「一键加回示例任务」时才用得上，
 * 纯粹是给人看格式的样板（新装时日程是空的）。 */
const SAMPLE_TASKS = {
  items: [
    { id: 't1', time: '09:30', text: '晨会 · 同步本周动画排期', repeat: 'workday', advance: 5, enabled: true },
    { id: 't2', time: '14:00', text: '提交走跑循环动画给主美', repeat: 'daily', advance: 10, enabled: true },
    { id: 't3', time: '18:30', text: '整理特效性能自查表', repeat: 'daily', advance: 0, enabled: true },
  ],
  lastFired: {},
}

function readJson(file, fallback) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (parsed && typeof parsed === 'object') return parsed
  } catch (err) {}
  return fallback
}
function writeJson(file, obj) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8')
    fs.renameSync(tmp, file)      // 原子替换：进程被杀/断电也不会留下半截 JSON
  } catch (err) {}
}
/* 覆盖前先留一份 .bak（只保一代）：任务/设置被意外清空时还能捞回来 */
function backupBeforeWrite(file) {
  try {
    if (!fs.existsSync(file)) return
    const raw = fs.readFileSync(file, 'utf8')
    const parsed = JSON.parse(raw)
    // 空内容不值得备份，免得把上一份好的备份顶掉
    const empty = parsed && Array.isArray(parsed.items) ? parsed.items.length === 0
      : (parsed && typeof parsed === 'object' ? Object.keys(parsed).length <= 1 : true)
    if (empty) return
    fs.writeFileSync(file + '.bak', raw, 'utf8')
  } catch (err) {}
}
function backupInfo(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file + '.bak', 'utf8'))
    const items = Array.isArray(parsed.items) ? parsed.items.length : Object.keys(parsed || {}).length
    const st = fs.statSync(file + '.bak')
    return { count: items, at: st.mtime.toISOString() }
  } catch (err) {
    return null
  }
}
// 时间归一化：容忍 7:5 / 7：05，越界夹紧，非法回退 09:00
function normTime(v) {
  const m = /^(\d{1,2})\s*[:：]\s*(\d{1,2})$/.exec(String(v === undefined || v === null ? '' : v).trim())
  if (!m) return '09:00'
  const h = Math.min(23, Math.max(0, Number(m[1])))
  const mi = Math.min(59, Math.max(0, Number(m[2])))
  return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0')
}
function normalizeTasks(payload) {
  const items = Array.isArray(payload && payload.items) ? payload.items : []
  return {
    items: items.slice(0, 200).map((it, i) => ({
      id: String((it && it.id) || ('t' + Date.now() + '_' + i)),
      time: normTime(it && it.time),
      text: String((it && it.text) || '').slice(0, 200),
      repeat: ['daily', 'workday', 'weekend', 'once'].includes(it && it.repeat) ? it.repeat : 'daily',
      advance: Math.min(120, Math.max(0, Number(it && it.advance) || 0)),
      enabled: !(it && it.enabled === false),
    })),
    lastFired: (payload && payload.lastFired && typeof payload.lastFired === 'object') ? payload.lastFired : {},
  }
}

let settings = Object.assign({}, DEFAULT_SETTINGS, readJson(SETTINGS_FILE, {}))
let alarm = readJson(ALARM_FILE, null)      // 闹钟/计时排期（可能为空）
let tasks = readJson(TASKS_FILE, null)
if (!tasks || !Array.isArray(tasks.items)) {
  // 首次运行 / 数据文件缺失：默认空日程（不塞示例任务）
  tasks = { items: [], lastFired: {} }
  writeJson(TASKS_FILE, tasks)
}
tasks = normalizeTasks(tasks)

function snapshot() {
  return { ok: true, settings, tasks, alarm, anchor, dataDir: DATA_DIR, backup: backupInfo(TASKS_FILE) }
}
function broadcast() {
  const st = snapshot()
  for (const w of BrowserWindow.getAllWindows()) {
    try { w.webContents.send('state:changed', st) } catch (err) {}
  }
}

/* ============================ 桌宠窗口 ============================ */
/* 桌宠窗口的落点必须在某块屏幕的工作区内：
 * 换显示器 / 拔掉副屏 / 改分辨率后，window.json 里的旧坐标可能整块落在屏幕外，
 * 那样光标永远不会在宠物上 → 窗口永远全穿透 → 用户拖都拖不回来。 */
function clampToWorkArea(x, y) {
  const cand = { x: Math.round(x), y: Math.round(y) }
  const cx = cand.x + WIN_W / 2
  const cy = cand.y + WIN_H / 2
  const hit = screen.getAllDisplays().some((d) => {
    const a = d.workArea
    return cx >= a.x && cx <= a.x + a.width && cy >= a.y && cy <= a.y + a.height
  })
  if (hit) return cand
  const wa = screen.getPrimaryDisplay().workArea
  return { x: wa.x + wa.width - WIN_W, y: wa.y + wa.height - WIN_H }
}
/* 显示器变化后把桌宠夹回可见区域 */
function ensureOnScreen() {
  if (!petWin || petWin.isDestroyed()) return
  const b = petWin.getBounds()
  const p = clampToWorkArea(b.x, b.y)
  if (p.x !== b.x || p.y !== b.y) {
    petWin.setBounds({ x: p.x, y: p.y, width: b.width, height: b.height })
    savePos()
  }
}

function createPetWindow() {
  const saved = readJson(POS_FILE, null)
  const wa = screen.getPrimaryDisplay().workArea
  if (saved && ANCHORS.includes(saved.anchor)) anchor = saved.anchor
  const p = clampToWorkArea(
    saved && Number.isFinite(saved.x) ? saved.x : wa.x + wa.width - WIN_W,
    saved && Number.isFinite(saved.y) ? saved.y : wa.y + wa.height - WIN_H
  )

  petWin = new BrowserWindow({
    x: p.x, y: p.y, width: WIN_W, height: WIN_H,
    transparent: true, frame: false, resizable: false, maximizable: false, minimizable: false,
    fullscreenable: false, skipTaskbar: true, hasShadow: false, show: false,
    acceptFirstMouse: true, alwaysOnTop: !!settings.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  })
  petWin.setAlwaysOnTop(!!settings.alwaysOnTop, 'screen-saver')
  try { petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }) } catch (err) {}
  // 默认整窗穿透：透明区域的点击直接落到桌面上
  petWin.setIgnoreMouseEvents(true, { forward: true })
  petWin.loadFile(path.join(__dirname, 'renderer', 'pet.html'))
  petWin.once('ready-to-show', () => {
    if (settings.petVisible) petWin.showInactive()
    try { petWin.webContents.send('anchor', anchor) } catch (err) {}
    setTimeout(recordWinSize, 400)      // 显示稳定后记录一次真实窗口尺寸作为基线
    setTimeout(recordWinSize, 1600)
  })
  /* 渲染进程崩了 → 重载。否则会留下一个永不更新、穿透状态停在旧值的窗口，
   * 表现就是"整块透明窗永久吃掉点击"。 */
  petWin.webContents.on('render-process-gone', () => {
    if (!petWin || petWin.isDestroyed()) return
    dragState = null
    cursorState.interactive = null
    try { petWin.reload() } catch (err) {}
  })
  petWin.on('closed', () => {
    petWin = null
    dragState = null
    cursorState.interactive = null
    cursorState.menuOpen = false
    cursorState.menuRect = null
    cursorState.bubbleRect = null
  })
}

const SNAP_DIST = 60       // 宠物离边缘多近就吸附（逻辑像素）

/* 窗口尺寸基线：创建后记录一次真实尺寸，之后一律用它。
 * 教训：150% 缩放屏上 setBounds 的 DIP物理像素往返有微小取整误差，
 * 若每次拖动都 setBounds({width: getBounds().width})，误差会一路累积
 * （实测：正常拖几轮 660→662→664，用户长时间拖动后涨到 968x912）。*/
let winSize = { w: WIN_W, h: WIN_H }
function recordWinSize() {
  if (!petWin || petWin.isDestroyed()) return
  const b = petWin.getBounds()
  if (b.width > 100 && b.height > 100) winSize = { w: b.width, h: b.height }
}
function fixSize() {
  if (!petWin || petWin.isDestroyed()) return
  const b = petWin.getBounds()
  if (Math.abs(b.width - winSize.w) > 2 || Math.abs(b.height - winSize.h) > 2) {
    petWin.setBounds({ x: b.x, y: b.y, width: winSize.w, height: winSize.h })
  }
}

function petSize() {
  return Math.round(PET_BASE * (Number(settings.scale) || 1))
}
function snapNow() {
  if (!petWin || petWin.isDestroyed()) return
  const b = petWin.getBounds()
  const bw = winSize.w
  const bh = winSize.h
  const wa = screen.getDisplayNearestPoint({
    x: Math.round(b.x + bw / 2),
    y: Math.round(b.y + bh / 2),
  }).workArea
  const size = petSize()
  // 吸附判定基准是「看得见的宠物」，而不是整块透明窗口
  // anchor 约定：第 1 位 = 上下(t/b)，第 2 位 = 左右(l/r)
  let vSide = anchor[0]
  let hSide = anchor[1]
  const petLeft = hSide === 'l' ? b.x + PET_MARGIN : b.x + bw - PET_MARGIN - size
  const petTop = vSide === 't' ? b.y + PET_MARGIN : b.y + bh - PET_MARGIN - size
  let nx = b.x
  let ny = b.y
  if (settings.snapOn) {
    if (petLeft - wa.x <= SNAP_DIST) { hSide = 'l'; nx = wa.x - PET_MARGIN }
    else if (wa.x + wa.width - (petLeft + size) <= SNAP_DIST) { hSide = 'r'; nx = wa.x + wa.width - bw + PET_MARGIN }
    if (petTop - wa.y <= SNAP_DIST) { vSide = 't'; ny = wa.y - PET_MARGIN }
    else if (wa.y + wa.height - (petTop + size) <= SNAP_DIST) { vSide = 'b'; ny = wa.y + wa.height - bh + PET_MARGIN }
  }
  anchor = vSide + hSide
  // 显式写死基线尺寸（不读回实时尺寸），顺带把累积的膨胀修回来
  petWin.setBounds({ x: Math.round(nx), y: Math.round(ny), width: winSize.w, height: winSize.h })
  savePos()
  try { petWin.webContents.send('anchor', anchor) } catch (err) {}
}
/* 位置落盘：只此一处，避免到处手写 writeJson(POS_FILE, …) */
function savePos() {
  if (!petWin || petWin.isDestroyed()) return
  const b = petWin.getBounds()
  writeJson(POS_FILE, { x: b.x, y: b.y, anchor })
}

/* ============================ 鼠标穿透（主进程自己判定） ============================
 * 实测：本机 Electron 下 setIgnoreMouseEvents(true,{forward:true}) 并不会把
 * mousemove 转发给渲染进程（渲染进程拿到 0 个事件），所以不能靠页面 hover 切换穿透。
 * 改为主进程每 40ms 读一次真实光标位置，自己算光标是在宠物/菜单上还是在透明区：
 *   · 在宠物上 → 关掉穿透，点击交给桌宠（能拖、能点、能右键）
 *   · 在透明区 → 打开穿透，点击直接落到桌面/其它窗口，绝不挡事
 * ================================================================================== */
const POLL_MS = 40                                   // 光标采样间隔
const REAFFIRM_TICKS = Math.round(1000 / POLL_MS)    // 每约 1 秒强制重申一次穿透状态（长期自愈）
const DRAG_STALE_MS = 10000                          // 拖动状态超过这么久没更新就当作丢了
const cursorState = { interactive: null, menuOpen: false, menuRect: null, bubbleRect: null, outsideSince: 0, tick: 0, forceUntil: 0 }

function petRectOnScreen() {
  const b = petWin.getBounds()
  const size = petSize()
  const left = anchor[1] === 'l' ? b.x + PET_MARGIN : b.x + b.width - PET_MARGIN - size
  const top = anchor[0] === 't' ? b.y + PET_MARGIN : b.y + b.height - PET_MARGIN - size
  return { left, top, right: left + size, bottom: top + size }
}
function setInteractive(on, force) {
  if (!petWin || petWin.isDestroyed()) return
  if (!force && cursorState.interactive === on) return
  cursorState.interactive = on
  try { petWin.setIgnoreMouseEvents(!on, { forward: true }) } catch (err) {}
}
function pollCursor() {
  if (!petWin || petWin.isDestroyed()) return
  // 用窗口真实可见性判断，而不是设置里的开关：
  // 「试一下提醒」/点系统通知会在 petVisible=false 时把窗口显示出来，
  // 那时若还按开关走，窗口看得见却永远点不到。
  if (!petWin.isVisible()) { setInteractive(false); return }
  const c = screen.getCursorScreenPoint()
  const p = petRectOnScreen()
  const pad = 4
  // 兜底：拖动状态超过 10 秒没更新，说明 drag-end 丢了（渲染进程异常等），
  // 否则 !!dragState 会让整窗永久接收鼠标 = 透明区也吃掉点击
  if (dragState && Date.now() - (dragState.at || 0) > DRAG_STALE_MS) dragState = null
  const overPet = c.x >= p.left - pad && c.x <= p.right + pad && c.y >= p.top - pad && c.y <= p.bottom + pad
  let overMenu = false
  if (cursorState.menuOpen && cursorState.menuRect) {
    const b = petWin.getBounds()
    const m = cursorState.menuRect
    const ml = b.x + m.x
    const mt = b.y + m.y
    overMenu = c.x >= ml - pad && c.x <= ml + m.w + pad && c.y >= mt - pad && c.y <= mt + m.h + pad
  }
  // 气泡上带按钮时（提醒中的「稍后提醒 / 完成」），气泡区域也要能点
  let overBubble = false
  if (cursorState.bubbleRect) {
    const b = petWin.getBounds()
    const m = cursorState.bubbleRect
    const bl = b.x + m.x
    const bt = b.y + m.y
    overBubble = c.x >= bl - pad && c.x <= bl + m.w + pad && c.y >= bt - pad && c.y <= bt + m.h + pad
  }
  // 实测坑：反复切换穿透后，Windows 侧的实际状态可能和这里的缓存值不同步，
  // 于是"鼠标回到宠物上"却依然点不动。对策：
  //   · 光标刚进入宠物的 2.5 秒内，每轮（POLL_MS）都重申一遍 —— 这段时间最容易不同步
  //   · 平时每约 1 秒也强制重申一次，长期自愈
  const want = overPet || overMenu || overBubble || !!dragState
  if (want && cursorState.interactive !== true) cursorState.forceUntil = Date.now() + 2500
  cursorState.tick = (cursorState.tick + 1) % REAFFIRM_TICKS
  setInteractive(overPet || overMenu || overBubble || !!dragState, Date.now() < cursorState.forceUntil || cursorState.tick === 0)
  // 菜单开着但鼠标离开了 → 自动收起（400ms 宽限，避免抖动误关）
  if (cursorState.menuOpen && !overPet && !overMenu) {
    if (!cursorState.outsideSince) cursorState.outsideSince = Date.now()
    else if (Date.now() - cursorState.outsideSince > 400) {
      cursorState.outsideSince = 0
      try { petWin.webContents.send('menu:close') } catch (err) {}
    }
  } else {
    cursorState.outsideSince = 0
  }
}

/* ============================ 设置窗口 ============================ */
function openSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (settingsWin.isMinimized()) settingsWin.restore()   // 只 show()+focus() 时，Windows 不会从最小化还原
    settingsWin.show()
    settingsWin.focus()
    return
  }
  settingsWin = new BrowserWindow({
    width: 880, height: 740, minWidth: 680, minHeight: 560,
    center: true,
    useContentSize: true,          // 880×740 按「内容区」算，布局不用再扣掉标题栏
    title: '记事本桌宠 · 设置与时段任务',
    backgroundColor: '#f6f8ff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'))
  settingsWin.on('closed', () => { settingsWin = null })
}

/* ============================ 设置应用 ============================ */
// 开机自启该指向哪个 exe：
//   · 便携版会把自己解包到 %TEMP% 再运行，process.execPath 是那个临时路径，
//     重启后就不存在了 —— 所以要用 electron-builder 给的 PORTABLE_EXECUTABLE_FILE（你双击的那个 exe）
//   · 开发态指向 electron.exe + 项目目录
function autoStartTarget() {
  const portable = process.env.PORTABLE_EXECUTABLE_FILE
  if (portable) return { path: portable }
  if (app.isPackaged) return { path: process.execPath }
  return { path: process.execPath, args: [path.resolve(__dirname)] }
}
function setAutoStart(on) {
  /* 测试/临时运行不碰注册表：否则跑一次验收就会把使用者自己的开机自启改掉 */
  if (process.env.NOTEPAD_PET_NO_AUTOSTART) return
  let target = { path: process.execPath }
  try { target = autoStartTarget() } catch (err) {}
  const opts = Object.assign({ openAtLogin: !!on }, target)
  // 自启打开时每次都重新登记：这样从便携版换成安装版之后，
  // 注册表里的自启路径会自动更新成当前这个 exe（否则会一直指向旧的那个）
  let curPath = ''
  try { curPath = app.getLoginItemSettings().path || '' } catch (err) {}
  if (lastAutoStart === on && (!on || curPath === target.path)) return
  lastAutoStart = on
  try { app.setLoginItemSettings(opts) } catch (err) {}
}
function applySettingsSideEffects(prev) {
  if (petWin && !petWin.isDestroyed()) {
    if (settings.petVisible) petWin.showInactive()
    else petWin.hide()
    petWin.setAlwaysOnTop(!!settings.alwaysOnTop, 'screen-saver')
  }
  setAutoStart(!!settings.autoStart)
  // 托盘菜单里只体现这几个开关，其余改动不必重建菜单与图标
  const trayKeys = ['petVisible', 'soundOn', 'notifyOn', 'autoStart']
  if (!prev || trayKeys.some((k) => prev[k] !== settings[k])) rebuildTray()
}
/* 设置写入去抖：滑块这种高频输入不必每次都落盘 + 广播 */
let settingsWriteTimer = 0
function flushSettings() {
  clearTimeout(settingsWriteTimer)
  writeJson(SETTINGS_FILE, settings)
}
function patchSettings(patch) {
  const prev = settings
  const next = {}
  // 只接受已知键，避免任意键被合并进 settings 落盘
  Object.keys(DEFAULT_SETTINGS).forEach((k) => {
    if (patch && Object.prototype.hasOwnProperty.call(patch, k)) next[k] = patch[k]
  })
  settings = Object.assign({}, settings, next)
  settings.scale = Math.min(2, Math.max(0.6, Number(settings.scale) || 1))
  settings.vol = Math.min(1, Math.max(0, Number(settings.vol) || 0))
  settings.bubbleSec = Math.min(60, Math.max(0, Math.round(Number(settings.bubbleSec) || 0)))
  settings.snoozeMin = Math.min(120, Math.max(1, Math.round(Number(settings.snoozeMin) || 5)))
  if (!['skadi', 'xiaote', 'mumu'].includes(settings.character)) settings.character = 'skadi'
  if (!['duck', 'fx1'].includes(settings.soundSet)) settings.soundSet = 'duck'
  if (!['orb', 'a', 'none'].includes(settings.remindSound)) settings.remindSound = 'orb'
  settings.petVisible = settings.petVisible !== false
  settings.snapOn = settings.snapOn !== false
  settings.alwaysOnTop = settings.alwaysOnTop !== false
  settings.notifyOn = settings.notifyOn !== false
  settings.soundOn = settings.soundOn !== false
  settings.bubbleOn = settings.bubbleOn !== false
  settings.autoStart = settings.autoStart === true
  clearTimeout(settingsWriteTimer)
  settingsWriteTimer = setTimeout(flushSettings, 160)
  applySettingsSideEffects(prev)
  broadcast()
  return settings
}

/* ============================ 托盘 ============================ */
function rebuildTray() {
  const iconPath = path.join(__dirname, 'assets', 'pet.png')
  let icon = nativeImage.createFromPath(iconPath)
  if (!icon.isEmpty()) icon = icon.resize({ width: 16, height: 16 })
  if (!tray) {
    try {
      tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
      tray.setToolTip('记事本桌宠')
      tray.on('double-click', openSettingsWindow)
    } catch (err) { tray = null }
  }
  if (!tray) return
  const menu = Menu.buildFromTemplate([
    { label: '显示桌宠', type: 'checkbox', checked: !!settings.petVisible, click: (mi) => patchSettings({ petVisible: mi.checked }) },
    { label: '时段任务 / 设置…', click: openSettingsWindow },
    { type: 'separator' },
    { label: '静音', type: 'checkbox', checked: !settings.soundOn, click: (mi) => patchSettings({ soundOn: !mi.checked }) },
    { label: '到点发系统通知', type: 'checkbox', checked: !!settings.notifyOn, click: (mi) => patchSettings({ notifyOn: mi.checked }) },
    { label: '开机自启', type: 'checkbox', checked: !!settings.autoStart, click: (mi) => patchSettings({ autoStart: mi.checked }) },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuitting = true; app.quit() } },
  ])
  tray.setContextMenu(menu)
}

/* ============================ IPC ============================ */
ipcMain.handle('state:get', () => snapshot())

ipcMain.handle('settings:patch', (e, patch) => patchSettings(patch))

ipcMain.handle('tasks:save', (e, payload) => {
  backupBeforeWrite(TASKS_FILE)      // 覆盖前留一份 .bak
  // 只传 items 时不要清掉 lastFired，否则当天已提醒过的任务会重复提醒
  const merged = Object.assign({}, payload || {})
  if (!merged.lastFired || typeof merged.lastFired !== 'object') {
    merged.lastFired = (tasks && tasks.lastFired) || {}
  }
  tasks = normalizeTasks(merged)
  writeJson(TASKS_FILE, tasks)
  broadcast()
  return tasks
})

// 从 .bak 捞回上一份任务（设置窗口里「恢复上次备份」按钮用）
ipcMain.handle('tasks:restore-backup', () => {
  const bak = TASKS_FILE + '.bak'
  const parsed = readJson(bak, null)
  if (!parsed || !Array.isArray(parsed.items) || !parsed.items.length) return { ok: false, tasks }
  backupBeforeWrite(TASKS_FILE)
  tasks = normalizeTasks(parsed)
  writeJson(TASKS_FILE, tasks)
  broadcast()
  return { ok: true, tasks }
})

// 设置窗口里手动点「一键加回示例任务」时才写入这 3 条样板
ipcMain.handle('tasks:defaults', () => {
  backupBeforeWrite(TASKS_FILE)
  tasks = normalizeTasks(JSON.parse(JSON.stringify(SAMPLE_TASKS)))
  writeJson(TASKS_FILE, tasks)
  broadcast()
  return tasks
})

/* 闹钟/计时排期落盘：桌宠退出重开后能接着倒计时（过期的在渲染进程侧丢弃） */
ipcMain.handle('alarm:set', (e, a) => {
  if (!a || typeof a !== 'object' || !Number.isFinite(Number(a.at))) {
    alarm = null
  } else {
    alarm = {
      at: Number(a.at),
      text: String(a.text || '').slice(0, 200),
      hint: String(a.hint || '').slice(0, 200),
      desc: String(a.desc || '').slice(0, 40),
      kind: a.kind === 'snooze' ? 'snooze' : 'timer',
    }
  }
  writeJson(ALARM_FILE, alarm)
  return alarm
})

ipcMain.on('menu:state', (e, payload) => {
  cursorState.menuOpen = !!(payload && payload.open)
  cursorState.menuRect = payload && payload.rect ? payload.rect : null
  cursorState.outsideSince = 0
  pollCursor()
})

// 渲染进程报告"带按钮的气泡"的位置（只有提醒中才需要气泡接收鼠标）
ipcMain.on('pet:hit', (e, rect) => {
  cursorState.bubbleRect = rect && rect.w ? rect : null
})

ipcMain.on('pet:drag-start', () => {
  if (!petWin || petWin.isDestroyed()) return
  fixSize()                                    // 拖动前先把尺寸修回基线，避免越拖越大
  const c = screen.getCursorScreenPoint()
  const b = petWin.getBounds()
  dragState = { cx: c.x, cy: c.y, wx: b.x, wy: b.y, moved: false, at: Date.now() }
})

ipcMain.on('pet:drag-move', () => {
  if (!petWin || petWin.isDestroyed() || !dragState) return
  dragState.at = Date.now()
  const c = screen.getCursorScreenPoint()
  const dx = c.x - dragState.cx
  const dy = c.y - dragState.cy
  // 3px 死区：真实鼠标点击常带 1px 抖动，不能把它当成拖动
  if (!dragState.moved) {
    if (dx * dx + dy * dy < 9) return
    dragState.moved = true
  }
  const b = petWin.getBounds()
  petWin.setPosition(Math.round(dragState.wx + dx), Math.round(dragState.wy + dy))
})

let lastClickAt = 0     // 双击判定用
ipcMain.on('pet:drag-end', () => {
  const moved = !!(dragState && dragState.moved)
  dragState = null
  if (moved) snapNow()
  fixSize()
  if (!petWin || petWin.isDestroyed()) return
  if (moved) {
    lastClickAt = 0
    // 拖完窗口可能被吸附挪位，菜单若还开着就会留在旧位置（甚至盖住宠物）→ 一并收起
    try { petWin.webContents.send('menu:close') } catch (err) {}
    try { petWin.webContents.send('pet:drag-result', true) } catch (err) {}
    return
  }
  // 双击判定：500ms（Windows 默认）内点第二下 → 交给渲染进程当"双击确认"，不再算作第二次单击
  const now = Date.now()
  if (now - lastClickAt < 500) {
    lastClickAt = 0
    try { petWin.webContents.send('pet:double-click') } catch (err) {}
  } else {
    lastClickAt = now
    try { petWin.webContents.send('pet:drag-result', false) } catch (err) {}
  }
})

ipcMain.on('settings:open', () => openSettingsWindow())
// 「试一下提醒」：让桌宠立刻演一遍提醒效果
ipcMain.on('test:remind', () => {
  if (petWin && !petWin.isDestroyed()) {
    petWin.showInactive()
    try { petWin.webContents.send('test-remind') } catch (err) {}
  }
})
ipcMain.on('window:close', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender)
  if (w && w !== petWin) w.close()
})
ipcMain.on('pet:hide', () => patchSettings({ petVisible: false }))
ipcMain.on('app:quit', () => { app.isQuitting = true; app.quit() })
ipcMain.on('notify', (e, payload) => {
  // 提醒时先把桌宠叫到最前面（可能被别的窗口盖住了）
  if (petWin && !petWin.isDestroyed() && settings.petVisible) {
    try { petWin.showInactive() } catch (err) {}
  }
  if (!settings.notifyOn) return
  if (!Notification.isSupported()) return
  try {
    const n = new Notification({
      title: String((payload && payload.title) || '记事本桌宠').slice(0, 80),
      body: String((payload && payload.body) || '').slice(0, 200),
      silent: true,
      icon: nativeImage.createFromPath(path.join(__dirname, 'assets', 'pet.png')),
    })
    n.on('click', () => { if (petWin && !petWin.isDestroyed()) { petWin.showInactive(); petWin.webContents.send('focus-task') } })
    n.show()
  } catch (err) {}
})

/* ============================ 生命周期 ============================ */
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (petWin && !petWin.isDestroyed()) { petWin.showInactive(); petWin.webContents.send('anchor', anchor) }
    openSettingsWindow()
  })

  app.whenReady().then(() => {
    try { app.setAppUserModelId('com.notepadpet.desktop') } catch (err) {}
    try { lastAutoStart = app.getLoginItemSettings().openAtLogin } catch (err) {}
    if (!fs.existsSync(SETTINGS_FILE)) writeJson(SETTINGS_FILE, settings)   // 首次运行落一份，方便直接看/改
    createPetWindow()
    rebuildTray()
    // 启动时按当前设置应用一次：尤其是「开机自启」——
    // 之前只在设置变化时才登记，导致注册表项被清掉后启动不会再补上
    applySettingsSideEffects()
    /* 用户（或开机自启）把程序启动了 ⇒ 他要看见桌宠。
     * 「隐藏桌宠」是持久化的，之前藏过的话这里会一直是隐藏状态，
     * 表现就是"双击了却什么都不发生" —— 这一版改成一启动就显示出来。*/
    if (settings.petVisible === false) {
      patchSettings({ petVisible: true })
      if (settings.notifyOn && Notification.isSupported()) {
        try {
          new Notification({
            title: '记事本桌宠',
            body: '上次你把桌宠藏起来了，这次先显示出来。想再藏：右键菜单 → 隐藏桌宠',
            silent: true,
          }).show()
        } catch (err) {}
      }
    }
    setInterval(pollCursor, POLL_MS)
    // 换显示器 / 拔副屏 / 改分辨率后，把桌宠夹回可见区域
    try {
      screen.on('display-removed', ensureOnScreen)
      screen.on('display-metrics-changed', ensureOnScreen)
      screen.on('display-added', ensureOnScreen)
    } catch (err) {}
    app.on('activate', () => {
      if (!petWin || petWin.isDestroyed()) createPetWindow()
    })
  }).catch((err) => {
    // 兜底：初始化里任何一步抛错都不该让"应用活着但什么都没有"
    console.error('[notepad-pet] 启动失败：', err)
    try { createPetWindow() } catch (e2) {}
  })

  // 关掉所有窗口也不退出（桌宠常驻托盘）
  app.on('window-all-closed', (e) => {})
}