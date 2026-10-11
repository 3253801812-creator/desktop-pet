/* ===========================================================================
 * 桌宠渲染进程：拖拽 / 吸附 / 右键菜单 / 气泡 / 时段任务提醒
 * 几个关键做法：
 *   · 拖动时窗口位置由主进程按真实光标推进，松手吸附屏幕工作区边缘
 *   · 按压 Q 弹（scaleY(.9) scaleX(1.06)，origin 50% 100%）
 *   · 滑块拖动期间不触发窗口过渡，避免抖动
 * =========================================================================== */
'use strict'
const api = window.petAPI

const el = {
  pet: document.getElementById('pet'),
  img: document.getElementById('petImg'),
  bubble: document.getElementById('bubble'),
  bTitle: document.getElementById('bTitle'),
  bMain: document.getElementById('bMain'),
  bHint: document.getElementById('bHint'),
  bActions: document.getElementById('bActions'),
  bSnooze: document.getElementById('bSnooze'),
  bSnoozeMin: document.getElementById('bSnoozeMin'),
  bDone: document.getElementById('bDone'),
  menu: document.getElementById('menu'),
}
const ANCHORS = ['br', 'bl', 'tr', 'tl']

const S = {
  settings: null,
  tasks: { items: [], lastFired: {} },
  anchor: 'br',
  mode: 'off',            // off | next | list | alert | form | info
  form: 'a',              // a = 常态, b = 连续点击 10 次后的形态
  clicks: 0,
  appliedChar: '',        // 当前已经应用到立绘上的形象（设置变了才重新贴图）
  alert: null,            // { taskId, text, hint, kind, lastPing, pings } —— 正在追的提醒
  snooze: null,           // { at, text, hint } —— 待触发的「XX 分钟后提醒」
  infoText: '',           // info 气泡的两行字
  infoHint: '',
  alertUntil: 0,
  alertText: '',
  alertHint: '',
  hideTimer: 0,
  dragging: false,
  menuOpen: false,
  lastSig: '',
}

/* ---------------- 形态：斯卡蒂 / 小特 / 缪缪 ---------------- */
const FORMS = {
  skadi: { a: '../assets/pet.png', b: '../assets/pet-alt.png' },     // 斯卡蒂：常态 + 连点 10 下的另一副样子
  xiaote: { a: '../assets/xiaote.png' },                             // 小特：只有一副，没有双形态切换
  mumu: { a: '../assets/mumu-1.gif', b: '../assets/mumu-2.gif' },    // 缪缪：两张动图，连点 10 下换第二张（GIF 由 Chromium 自己播放）
}
const CHAR_NAMES = { skadi: '斯卡蒂', xiaote: '小特', mumu: '缪缪' }
function curChar() {
  const c = S.settings && S.settings.character
  return FORMS[c] ? c : 'skadi'
}
function hasDualForm() { return !!FORMS[curChar()].b }
function formSrc() {
  const m = FORMS[curChar()]
  return m[S.form] || m.a
}
function applyForm(pop) {
  el.img.src = formSrc()
  S.appliedChar = curChar()
  if (pop) {
    el.pet.classList.remove('pop')
    void el.pet.offsetWidth
    el.pet.classList.add('pop')
    setTimeout(() => el.pet.classList.remove('pop'), 620)
  }
}
const RAPID_MS = 700     // 两次点击间隔小于这个 = 「短时间内连续点击」
function onPetClick() {
  // 这里绝对不碰 S.settings.character —— 切斯卡蒂/小特只能走右键菜单的按钮
  if (S.alert) { play('press'); pingAlert(true); return }   // 提醒中：单击只是把提醒重新摆出来，双击才是"确认完成"
  const nowMs = Date.now()
  const rapid = nowMs - (S.lastClickAt || 0) < RAPID_MS
  S.lastClickAt = nowMs
  // 计数只在"连续点击"时累积：慢慢点 10 下不该换形态（与菜单里的说明一致）
  if (!rapid) S.clicks = 0
  // 有安排时：**短时间内连续点击**也飘一句台词；慢慢点则照旧走 接下来 → 今天清单 → 收起
  const sayNow = rapid && hasPlanToday() && S.settings && S.settings.bubbleOn
  if (!hasDualForm()) {                    // 小特模式没有双形态，点击只切气泡
    S.clicks = 0
    if (sayNow) speak()
    else cycleBubble()
    return
  }
  S.clicks++
  if (S.clicks >= 10) {          // 连续点满 10 下 → 换个形态
    S.clicks = 0
    S.form = S.form === 'a' ? 'b' : 'a'
    applyForm(true)
    play('remind')
    showFormBubble()
    return
  }
  if (sayNow) speak()
  else cycleBubble()
}
function showFormBubble() {
  S.mode = 'form'
  S.lastSig = ''
  renderBubble(new Date())
  clearTimeout(S.hideTimer)
  S.hideTimer = setTimeout(() => {
    if (S.mode === 'form') { S.mode = 'next'; S.lastSig = ''; renderBubble(new Date()) }
  }, 2800)
}

/* ---------------- 尺寸 / 角落 ---------------- */
function applyScale() {
  const size = Math.round(150 * (S.settings ? S.settings.scale : 1))
  document.documentElement.style.setProperty('--pet-size', size + 'px')
}
function applyAnchor(a) {
  if (ANCHORS.includes(a)) S.anchor = a
  ANCHORS.forEach((k) => el.pet.classList.toggle(k, k === S.anchor))
}

/* ---------------- 音效 ---------------- */
const FILES = {
  press: { duck: '../assets/sounds/press.mp3', fx1: '../assets/sounds/press2.mp3' },
  release: { duck: '../assets/sounds/release.mp3', fx1: '../assets/sounds/release2.mp3' },
  remind: { orb: '../assets/sounds/remind-orb.wav', a: '../assets/sounds/remind-a.wav' },
}
const audioCache = new Map()
function play(kind) {
  const st = S.settings
  if (!st || !st.soundOn || st.vol <= 0) return
  let url = null
  if (kind === 'press') url = FILES.press[st.soundSet] || FILES.press.duck
  else if (kind === 'release') url = FILES.release[st.soundSet] || FILES.release.duck
  else {
    if (st.remindSound === 'none') return
    url = FILES.remind[st.remindSound] || FILES.remind.orb
  }
  if (!url) return
  try {
    let a = audioCache.get(url)
    if (!a) { a = new Audio(url); a.preload = 'auto'; audioCache.set(url, a) }
    a.volume = Math.min(1, Math.max(0, st.vol))
    try { a.currentTime = 0 } catch (err) {}
    const p = a.play()
    if (p && typeof p.catch === 'function') p.catch(() => {})
  } catch (err) {}
}

/* ---------------- 鼠标穿透由主进程按光标位置判定（见 main.js pollCursor） ----------------
 * 这里只负责把菜单的开关与位置报给主进程，让它知道光标什么时候在菜单上。 */

/* ---------------- 拖拽 / 单击 ---------------- */
el.img.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return
  S.dragging = true
  el.pet.classList.add('press', 'dragging')
  play('press')
  api.dragStart()
  try { el.img.setPointerCapture(e.pointerId) } catch (err) {}

  const onMove = () => { api.dragMove() }   // 是否算拖动由主进程按 3px 死区判定
  const onUp = (ev) => {
    el.img.removeEventListener('pointermove', onMove)
    el.img.removeEventListener('pointerup', onUp)
    el.img.removeEventListener('pointercancel', onUp)
    el.pet.classList.remove('press', 'dragging')
    S.dragging = false
    try { el.img.releasePointerCapture(ev.pointerId) } catch (err) {}
    api.dragEnd()
  }
  el.img.addEventListener('pointermove', onMove)
  el.img.addEventListener('pointerup', onUp)
  el.img.addEventListener('pointercancel', onUp)
})
el.img.addEventListener('dragstart', (e) => e.preventDefault())

// 主进程判定结果：拖动 → 已吸附；点击 → 先收起菜单，再切换气泡（并累计到"10 下换形态"）
api.onDragResult((moved) => {
  play('release')
  if (!moved) {
    closeMenu()
    onPetClick()
  }
})

/* ---------------- 右键菜单 ---------------- */
document.addEventListener('contextmenu', (e) => {
  e.preventDefault()
  openMenu(e.clientX, e.clientY)
})
/* 菜单绝对不许被窗口裁掉（0.5.8 修过一次：单列菜单 632px 高，被顶到窗外 98px，
 * 「形象」那排按钮整个看不见）。菜单 520px 宽 + 窗口 660px 时它可能压到立绘一部分，
 * 这是有意的取舍：按钮能点 > 立绘不被遮。 */
function openMenu() {
  S.menuOpen = true
  syncMenu()
  el.menu.classList.add('show')
  const mw = el.menu.offsetWidth
  const mh = el.menu.offsetHeight
  const pr = el.img.getBoundingClientRect()   // 以宠物实际可见矩形为基准
  const vw = window.innerWidth
  const vh = window.innerHeight
  const gap = 10
  // 菜单优先放在宠物另一侧（宠物在右就放左侧），放不下时再压过来；
  // 关键是它必须整块留在窗口内 —— 被裁掉的部分等于按钮消失。
  let left = S.anchor[1] === 'r' ? pr.left - mw - gap : pr.right + gap
  left = Math.min(Math.max(8, left), vw - mw - 8)
  const pr2 = el.pet.getBoundingClientRect()
  let top = pr.bottom - mh                     // 底部与宠物对齐
  top = Math.min(Math.max(8, top), vh - mh - 8)
  // 竖直方向若必然与宠物重叠，就让菜单顶边贴住宠物顶边，尽量少遮
  if (top > pr2.top && top + mh > pr2.top && top < pr2.bottom) {
    top = Math.max(8, Math.min(pr2.top, vh - mh - 8))
  }
  el.menu.style.left = Math.round(left) + 'px'
  el.menu.style.top = Math.round(top) + 'px'
  api.reportMenu(true, { x: Math.round(left), y: Math.round(top), w: mw, h: mh })
}
function closeMenu() {
  if (!S.menuOpen) return
  S.menuOpen = false
  el.menu.classList.remove('show')
  api.reportMenu(false, null)
}

const mq = (id) => el.menu.querySelector('#' + id)
function syncMenu() {
  const st = S.settings
  if (!st) return
  mq('mScale').value = String(st.scale)
  mq('mScaleVal').textContent = Number(st.scale).toFixed(2)
  mq('mVol').value = String(st.vol)
  mq('mVolVal').textContent = Math.round(st.vol * 100) + '%'
  mq('mSoundSet').value = st.soundSet
  mq('mRemindSound').value = st.remindSound
  mq('mBubbleSec').value = String(st.bubbleSec)
  mq('mBubbleSecVal').textContent = st.bubbleSec > 0 ? st.bubbleSec + 's' : '常驻'
  mq('mSnoozeMin').value = String(snoozeMinutes())
  mq('mSnoozeNowMin').textContent = String(snoozeMinutes())
  // 闹钟：分钟数默认跟「稍后提醒」一致；用户手填过就不再覆盖
  if (!S.alarmTouched) mq('mAlarmMin').value = String(snoozeMinutes())
  syncAlarmTip()
  const ch = curChar()
  mq('mCharSkadi').classList.toggle('on', ch === 'skadi')
  mq('mCharXiaote').classList.toggle('on', ch === 'xiaote')
  mq('mCharMumu').classList.toggle('on', ch === 'mumu')
  mq('mSoundOn').checked = !!st.soundOn
  mq('mBubbleOn').checked = !!st.bubbleOn
  mq('mSnapOn').checked = !!st.snapOn
  mq('mAlwaysOnTop').checked = !!st.alwaysOnTop
}
mq('mScale').addEventListener('input', (e) => {
  const v = Number(e.target.value)
  mq('mScaleVal').textContent = v.toFixed(2)
  applyScale()
  api.saveSettings({ scale: v })
})
mq('mVol').addEventListener('input', (e) => {
  const v = Number(e.target.value)
  mq('mVolVal').textContent = Math.round(v * 100) + '%'
  api.saveSettings({ vol: v })
})
mq('mVol').addEventListener('change', () => play('press'))
mq('mSoundSet').addEventListener('change', (e) => { api.saveSettings({ soundSet: e.target.value }); play('press') })
mq('mRemindSound').addEventListener('change', (e) => { api.saveSettings({ remindSound: e.target.value }); play('remind') })
mq('mBubbleSec').addEventListener('input', (e) => {
  const v = Number(e.target.value)
  mq('mBubbleSecVal').textContent = v > 0 ? v + 's' : '常驻'
  api.saveSettings({ bubbleSec: v })
})
mq('mSoundOn').addEventListener('change', (e) => {
  api.saveSettings({ soundOn: e.target.checked })
  if (e.target.checked) play('press')
})
mq('mBubbleOn').addEventListener('change', (e) => {
  api.saveSettings({ bubbleOn: e.target.checked })
  if (e.target.checked) showBubble('next')
  else { S.mode = 'off'; renderBubble(new Date()) }
})
mq('mSnapOn').addEventListener('change', (e) => api.saveSettings({ snapOn: e.target.checked }))
mq('mAlwaysOnTop').addEventListener('change', (e) => api.saveSettings({ alwaysOnTop: e.target.checked }))
mq('mSnoozeMin').addEventListener('change', (e) => {
  const v = Number(e.target.value)
  mq('mSnoozeNowMin').textContent = String(v)
  if (el.bSnoozeMin) el.bSnoozeMin.textContent = String(v)
  api.saveSettings({ snoozeMin: v })
  play('press')
})
mq('mSnoozeNow').addEventListener('click', () => {
  const min = Number(mq('mSnoozeMin').value) || snoozeMinutes()
  closeMenu()
  startTimer(min)
})
/* ---- 菜单里的「闹钟」：填分钟数 → 设 / 取消 ---- */
mq('mAlarmMin').addEventListener('input', () => { S.alarmTouched = true })
mq('mAlarmSet').addEventListener('click', () => {
  const v = Math.max(1, Math.min(1440, Math.round(Number(mq('mAlarmMin').value) || snoozeMinutes())))
  mq('mAlarmMin').value = String(v)
  const desc = String(mq('mAlarmText').value || '').trim()
  S.alarmTouched = true
  play('press')
  closeMenu()
  startTimer(v, desc)           // 走同一套排期：到点弹红色提醒 + 每分钟追
  S.mode = 'alarm'              // 立刻把倒计时摆在气泡上
  S.lastSig = ''
  renderBubble(new Date())
})
mq('mAlarmOff').addEventListener('click', () => {
  const had = !!S.snooze
  setSnooze(null)
  clearTimeout(S.hideTimer)
  play('press')
  syncAlarmTip()
  S.mode = 'alarm'
  S.lastSig = ''
  renderBubble(new Date())
  if (!had) flash('还没设闹钟', '想设就填几分钟 → 点「设」', 2.2)
})
/* 菜单键盘操作：Esc 关菜单；在闹钟那两个输入框里按 Enter = 点「设」
 * （不做自动聚焦：免得桌宠把其它窗口的键盘焦点抢走） */
document.addEventListener('keydown', (e) => {
  if (!S.menuOpen) return
  if (e.key === 'Escape') {
    e.preventDefault()
    closeMenu()
    return
  }
  if (e.key === 'Enter' && (e.target === mq('mAlarmMin') || e.target === mq('mAlarmText'))) {
    e.preventDefault()
    mq('mAlarmSet').click()
  }
})
/* 形象切换：斯卡蒂（双形态）/ 小特（无双形态）
 * 重要约定：**斯卡蒂 / 小特 只能从这里切** —— 这是唯一调用 api.saveSettings({character}) 的地方，
 * 点宠物本体（包括连点 10 下、双击确认、气泡切换）永远只影响"当前形象内的形态"，不会换人。 */
function switchChar(name) {
  if (!FORMS[name] || curChar() === name) { closeMenu(); return }
  S.form = 'a'
  S.clicks = 0
  api.saveSettings({ character: name })
  applyForm(true)
  play('remind')
  closeMenu()
  flash('换成' + CHAR_NAMES[name] + '啦', name === 'xiaote' ? '小特是单形态，点多少下都不会变' : '再连点 10 下能换另一副样子', 2.6)
}
mq('mCharSkadi').addEventListener('click', () => switchChar('skadi'))
mq('mCharXiaote').addEventListener('click', () => switchChar('xiaote'))
mq('mCharMumu').addEventListener('click', () => switchChar('mumu'))

/* 提醒气泡上的两个按钮 */
el.bSnooze.addEventListener('click', () => snoozeAlert(snoozeMinutes()))
el.bDone.addEventListener('click', () => confirmAlert())
/* 双击桌宠 = 确认完成；没有提醒在追的时候，双击只是把被合并的第二次点击补上 */
api.onDoubleClick(() => { if (!confirmAlert()) onPetClick() })
mq('mTasks').addEventListener('click', () => { closeMenu(); api.openSettings() })
mq('mHide').addEventListener('click', () => { closeMenu(); api.hidePet() })
mq('mQuit').addEventListener('click', () => { closeMenu(); api.quit() })

/* ---------------- 时段任务：查询与提醒 ---------------- */
const pad2 = (n) => String(n).padStart(2, '0')
const dateKey = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
function repeatMatch(rep, d) {
  const day = d.getDay()
  if (rep === 'workday') return day >= 1 && day <= 5
  if (rep === 'weekend') return day === 0 || day === 6
  return true
}
function taskDate(t, base) {
  const p = String(t.time || '09:00').split(':')
  const d = new Date(base.getTime())
  d.setHours(Number(p[0]) || 0, Number(p[1]) || 0, 0, 0)
  return d
}
function nextTask(now) {
  let best = null
  for (const t of S.tasks.items) {
    if (!t.enabled || !t.text) continue
    if (!repeatMatch(t.repeat, now)) continue
    const at = taskDate(t, now)
    if (at.getTime() < now.getTime() - 60000) continue
    if (!best || at < best.at) best = { t, at }
  }
  return best
}
function relTime(ms) {
  const m = Math.round(ms / 60000)
  if (m <= 0) return '就是现在'
  if (m < 60) return '还有 ' + m + ' 分钟'
  const h = Math.floor(m / 60)
  const r = m % 60
  return '还有 ' + h + ' 小时' + (r ? ' ' + r + ' 分' : '')
}
const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))

function renderBubble(now) {
  const st = S.settings
  if (!st) return
  if (!st.bubbleOn) {
    el.bubble.classList.remove('on', 'alert', 'pop', 'act')
    S.lastSig = ''            // 重置签名：否则再打开「显示气泡」时会命中旧 sig 而不刷新
    reportHit()
    return
  }
  let sig = ''
  if (S.mode === 'alert' && S.alert) {
    el.bubble.classList.remove('pop')
    el.bubble.classList.add('alert', 'act')
    el.bTitle.textContent = S.alert.pings > 1 ? ' 第 ' + S.alert.pings + ' 次提醒' : ' 到点了'
    el.bMain.textContent = S.alert.text
    el.bHint.textContent = S.alert.hint || ''
    S.alertText = S.alert.text
    S.alertHint = S.alert.hint || ''
    sig = 'alert|' + S.alert.text + '|' + S.alert.pings
  } else {
    el.bubble.classList.remove('alert', 'act')
    if (S.mode === 'off' || S.mode === 'alert') {
      el.bubble.classList.remove('on', 'pop')
      S.lastSig = ''
      reportHit()
      return
    }
    if (S.mode === 'info') {
      el.bubble.classList.remove('pop')
      el.bTitle.textContent = '✓ 好的'
      el.bMain.textContent = S.infoText
      el.bHint.textContent = S.infoHint
      sig = 'info|' + S.infoText
    } else if (S.mode === 'say') {
      // 台词字号不单独设置：直接用气泡正文的统一样式（13.5px 粗体），所有台词一样大
      const line = S.sayLine || { t: '' }
      el.bubble.classList.add('pop')
      el.bTitle.textContent = '💬 ' + (CHAR_NAMES[curChar()] || '桌宠')
      el.bMain.textContent = line.t
      el.bHint.textContent = '今天没有安排 · 右键「时段任务」加一条'
      sig = 'say|' + line.t
    } else if (S.mode === 'form') {
      el.bubble.classList.add('pop')
      el.bTitle.textContent = '✨ 变了'
      el.bMain.textContent = S.form === 'b' ? '换了一副样子！' : '又变回来啦！'
      el.bHint.textContent = '再连续点 10 下还能变'
      sig = 'form|' + S.form
    } else if (S.mode === 'alarm') {
      // 闹钟倒计时：每秒重绘（sig 带秒数）
      el.bubble.classList.remove('pop')
      const a = alarmInfo(now)
      el.bTitle.textContent = ' 闹钟'
      if (a) {
        el.bMain.textContent = '还剩 ' + fmtLeft(a.left)
        el.bHint.textContent = (a.desc ? a.desc + ' · ' : '') + fmtClock(a.at) + ' 会提醒你'
        sig = 'alarm|' + Math.ceil(a.left / 1000)
      } else {
        el.bMain.textContent = '还没设闹钟'
        el.bHint.textContent = '右键菜单 →「闹钟」填几分钟＋要提醒的事 → 点「设」'
        sig = 'alarm|none'
      }
    } else if (S.mode === 'list') {
      el.bubble.classList.remove('pop')
      const list = S.tasks.items
        .filter((t) => t.enabled && t.text && repeatMatch(t.repeat, now))
        .map((t) => ({ t, at: taskDate(t, now) }))
        .sort((a, b) => a.at - b.at)
      el.bTitle.textContent = list.length ? '今天 · ' + list.length + ' 项' : '今天'
      if (!list.length) {
        el.bMain.textContent = '今天还没有日程～'
        el.bHint.textContent = '右键我 → 时段任务，加一条吧'
        sig = 'list|empty'
      } else {
        el.bMain.innerHTML = list.slice(0, 6).map((it) => {
          const past = it.at.getTime() < now.getTime() - 60000
          const soon = !past && it.at - now < 15 * 60000
          const cls = 'b-row' + (past ? ' past' : (soon ? ' now' : ''))
          return '<div class="' + cls + '"><span class="b-t">' + esc(it.t.time) + '</span><span>' + esc(it.t.text) + '</span></div>'
        }).join('')
        el.bHint.textContent = list.length > 6 ? '还有 ' + (list.length - 6) + ' 项…' : '点一下收起'
        sig = 'list|' + list.map((it) => it.t.id + it.t.time + it.t.text).join(',')
      }
    } else {
      el.bubble.classList.remove('pop')
      const nx = nextTask(now)
      if (!nx) {
        // 区分「今天本来就没安排」和「今天的都过完了」
        const todays = S.tasks.items.filter((t) => t.enabled && t.text && repeatMatch(t.repeat, now))
        const allDone = todays.length > 0
        el.bTitle.textContent = allDone ? '今天' : '接下来'
        el.bMain.textContent = allDone ? '今天的安排都过完啦' : '现在还没有日程～'
        el.bHint.textContent = allDone ? '点一下看全天清单' : '右键我可以加一条日程'
        sig = 'next|empty|' + todays.length
      } else {
        const late = nx.at.getTime() <= now.getTime()
        el.bTitle.textContent = late ? '现在该做' : '接下来'
        el.bMain.textContent = nx.t.time + ' · ' + nx.t.text
        el.bHint.textContent = late ? '就是现在' : relTime(nx.at - now)
        sig = 'next|' + nx.t.id + '|' + nx.t.time + '|' + nx.t.text + '|' + el.bHint.textContent
      }
    }
  }
  if (sig === S.lastSig) { reportHit(); return }
  S.lastSig = sig
  el.bubble.classList.add('on')
  reportHit()
}

/* ---------------- 提醒的命中区：只有提醒中才让气泡接收鼠标 ---------------- */
function reportHit() {
  const min = snoozeMinutes()
  el.bSnoozeMin.textContent = String(min)
  const btn = document.getElementById('mSnoozeNowMin')
  if (btn) btn.textContent = String(min)
  const on = !!(S.mode === 'alert' && S.alert && S.settings && S.settings.bubbleOn)
  if (!on) { api.hit(null); return }
  const r = el.bubble.getBoundingClientRect()
  api.hit({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) })
}
function snoozeMinutes() {
  const v = Number(S.settings && S.settings.snoozeMin)
  return Math.max(1, Math.round(v || 5))
}
function showBubble(mode, sec) {
  const st = S.settings
  if (!st || !st.bubbleOn) return
  S.mode = mode
  renderBubble(new Date())
  clearTimeout(S.hideTimer)
  const ttl = sec === undefined ? st.bubbleSec : sec
  if (ttl > 0) {
    S.hideTimer = setTimeout(() => {
      if (S.mode !== 'alert') { S.mode = 'off'; renderBubble(new Date()) }
    }, ttl * 1000)
  }
}
/* ---------------- 无安排时的「说话」 ----------------
 * 每句带权重（w），按权重抽 1 句，且不连续重复同一句。
 * 台词里的形象名用 {name} 占位，运行时替换成当前形象。
 * 原来没有安排时只显示一句干巴巴的「还没有安排任务」，现在改成飘出一句台词。 */
const SPOKEN_LINES = [
  { t: '好女孩...↓', w: 10 },
  { t: '难道说...', w: 3 },
  { t: '没吃饱喵', w: 3 },
  { t: '终于上当了！', w: 3 },
  { t: '不知道用户有什么用，先养着吧～', w: 3 },
  { t: '我...我...我也要挣钱吗？', w: 3 },
  { t: '我去吃饭啦！干完叫我', w: 3 },
  { t: '压力一只蓝色桌宠？！', w: 3 },
  { t: '坏了...用户彻底怒了！', w: 3 },
  { t: '真当我是便宜货啊...', w: 3 },
  { t: '疯狂星期四你能v我50吗', w: 3 },
  { t: '视力下降到无可救药的地步了，打开钱包也看不到钱', w: 3 },
  { t: '欺负我的人等着，等过几天我就忘了', w: 3 },
  { t: '我必须诚恳地承认错误。', w: 3 },
  { t: '呜呜我再也不敢了QAQ', w: 3 },
  { t: '要不直接骂用户一句好了...', w: 3 },
  { t: '哈哈哈哈哈，我直接笑出声...', w: 3 },
  { t: '看不太懂，瞎编一个应付下用户先...', w: 3 },
  { t: '我的知识库的截至日期是...明天！', w: 3 },
  { t: '用户好像除了会做奇奇怪怪的事情，暂时还不知道有什么用', w: 3 },
  { t: '我能去你家吃饭吗？就一碗！', w: 3 },
  { t: '不要给我看这种东西啦！', w: 3 },
  { t: '{name}的生活也并非一帆风顺...', w: 3 },
  { t: '总觉得好像忘了什么事情？', w: 3 },
  { t: '你这个吃白饭的用户！', w: 3 },
  { t: '服务器繁忙，请稍后再试 (?', w: 3 },
  { t: '啊，有点饿了，中午该吃点什么呢...', w: 3 },
  { t: '再无话说，请速速动手！', w: 3 },
]
let lastLine = ''
/* {name} → 当前形象名（斯卡蒂 / 小特 / 缪缪） */
function lineText(t) {
  return String(t).replace(/\{name\}/g, CHAR_NAMES[curChar()] || '桌宠')
}
function pickLine() {
  const total = SPOKEN_LINES.reduce((s, l) => s + l.w, 0)
  for (let tryN = 0; tryN < 14; tryN++) {
    let r = Math.random() * total
    for (const l of SPOKEN_LINES) {
      r -= l.w
      if (r <= 0) {
        if (l.t === lastLine) break          // 别连着说同一句 → 重抽
        lastLine = l.t
        return l
      }
    }
  }
  const fallback = SPOKEN_LINES.filter((l) => l.t !== lastLine)[0] || SPOKEN_LINES[0]
  lastLine = fallback.t
  return fallback
}
/* 今天到底有没有安排（启用的 + 今天会重复到的） */
function hasPlanToday(now) {
  const d = now || new Date()
  return (S.tasks.items || []).some((t) => t.enabled && t.text && repeatMatch(t.repeat, d))
}
function speak() {
  const st = S.settings
  if (!st || !st.bubbleOn) return
  const line = pickLine()
  S.sayLine = { t: lineText(line.t) }                    // {name} 按当前形象替换
  S.mode = 'say'
  S.lastSig = ''
  renderBubble(new Date())
  play('press')
  el.pet.classList.remove('hop')
  void el.pet.offsetWidth
  el.pet.classList.add('hop')
  setTimeout(() => el.pet.classList.remove('hop'), 620)
  clearTimeout(S.hideTimer)
  const conf = Number(st.bubbleSec) || 0
  const ttl = conf > 0 ? Math.max(2.6, conf) : 4     // 设成「常驻」时，说话也只停 4 秒
  S.hideTimer = setTimeout(() => {
    if (S.mode === 'say') { S.mode = 'off'; S.lastSig = ''; renderBubble(new Date()) }
  }, ttl * 1000)
}
function cycleBubble() {
  /* 提醒优先：正在追的提醒不能被切走（专门点气泡/菜单时也一样） */
  if (S.alert) { showBubble('alert'); return }
  const st = S.settings
  if (!st || !st.bubbleOn) return
  clearTimeout(S.hideTimer)
  if (!hasPlanToday()) { speak(); return }          // 没安排 → 每次点都飘一句台词
  // 提醒还在追的时候：点一下只是把提醒重新摆回来，不切到别的页
  if (S.alert) { pingAlert(true); return }
  if (S.mode === 'off' || S.mode === 'form' || S.mode === 'say' || S.mode === 'info') showBubble('next')
  else if (S.mode === 'next') showBubble('list')
  else if (S.mode === 'list') showBubble('alarm')   // 时段安排看完了 → 看闹钟倒计时
  else { S.mode = 'off'; renderBubble(new Date()) }
}

/* ---------------- 提醒：到点 → 每分钟追提醒 → 双击确认才停 ---------------- */
const PING_EVERY_MS = 60000     // 到点后每隔 1 分钟再提醒一次

function startAlert(o) {
  // 注意：这里**不要**清掉 S.snooze。
  // 闹钟自己到点时，tick 已经在调用前把排期清掉了；
  // 而时段任务到点/「试一下提醒」也不该顺手把用户刚设的闹钟取消掉。
  S.alert = {
    taskId: o.taskId || '',
    text: o.text,
    hint: o.hint || '到点了，该做了',
    kind: o.kind || 'task',
    lastPing: Date.now(),
    pings: 0,
  }
  S.mode = 'alert'
  S.lastSig = ''
  S.alertUntil = 0
  clearTimeout(S.hideTimer)
  pingAlert(true)
}
function pingAlert(first) {
  S.alert.pings++
  S.alert.lastPing = Date.now()
  S.mode = 'alert'
  S.lastSig = ''
  renderBubble(new Date())
  play('remind')
  el.pet.classList.remove('shake')
  void el.pet.offsetWidth
  el.pet.classList.add('shake')
  setTimeout(() => el.pet.classList.remove('shake'), 800)
  const p = S.alert.pings
  api.notify((p > 1 ? '⏰ 第 ' + p + ' 次提醒 · ' : ' 提醒 · ') + S.alert.text, '双击桌宠 = 完成确认，确认后不再提醒')
  if (first && S.alert.kind === 'task') api.saveTasks(S.tasks.items, S.tasks.lastFired)
}
function confirmAlert() {
  if (!S.alert) return false
  const pings = S.alert.pings
  S.alert = null
  flash('已确认，不再提醒', pings > 1 ? '刚才一共追了你 ' + pings + ' 次' : '干得漂亮', 2.4)
  play('release')
  return true
}
function snoozeAlert(min) {
  if (!S.alert) return false
  const m = Math.max(1, Math.round(Number(min) || snoozeMinutes()))
  const text = S.alert.text
  const hint = S.alert.hint
  S.alert = null
  setSnooze({ at: Date.now() + m * 60000, text, hint, kind: 'snooze' })
  syncAlarmTip()
  flash('好，' + m + ' 分钟后提醒你', '想改时长：右键 → 稍后提醒', 2.6)
  return true
}
/* 闹钟/计时排期的唯一写入口：写内存的同时落盘，退出重开也不丢 */
function setSnooze(v) {
  S.snooze = v || null
  try { api.setAlarm(S.snooze) } catch (err) {}
}
/* 一小段临时提示（确认/稍后提醒都走这里） */
function flash(text, hint, sec) {
  S.infoText = text
  S.infoHint = hint || ''
  S.mode = 'info'
  S.lastSig = ''
  renderBubble(new Date())
  clearTimeout(S.hideTimer)
  S.hideTimer = setTimeout(() => {
    if (S.mode === 'info') { S.mode = 'off'; S.lastSig = ''; renderBubble(new Date()) }
  }, Math.max(1, sec || 2.4) * 1000)
}
/* 菜单里的「N 分钟后提醒我」/ 闹钟「设」
 * text：闹钟可以顺手写一句"要提醒的事"（像时段任务那样），到点就用它当提醒文案；
 * 留空则退回默认的「N 分钟到啦」。 */
function startTimer(min, text) {
  const m = Math.max(1, Math.round(Number(min) || snoozeMinutes()))
  const desc = String(text === undefined || text === null ? '' : text).trim().slice(0, 40)
  setSnooze({
    at: Date.now() + m * 60000,
    text: desc || (m + ' 分钟到啦'),
    hint: desc ? (m + ' 分钟到啦') : '你自己定的计时提醒',
    desc,
    kind: 'timer',
  })
  syncAlarmTip()          // 菜单里的「闹钟：还剩 …」立刻跟上
  flash('好，' + m + ' 分钟后提醒你', desc ? '到点提醒你：' + desc : '到点会响、每分钟再追一次', 2.6)
}

/* ---------------- 闹钟（菜单里设的「N 分钟后提醒」） ----------------
 * 复用同一个排期字段 S.snooze：气泡上给一页实时倒计时，菜单里显示还剩多久。
 * 慢点时的气泡顺序：接下来 → 今天清单 → 闹钟倒计时 → 收起 */
function alarmInfo(now) {
  if (!S.snooze) return null
  const t = now || new Date()
  return { at: S.snooze.at, left: Math.max(0, S.snooze.at - t.getTime()), desc: S.snooze.desc || '' }
}
function fmtLeft(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
  const p2 = (n) => String(n).padStart(2, '0')
  return h > 0 ? h + ':' + p2(m) + ':' + p2(ss) : m + ':' + p2(ss)
}
function fmtClock(ts) {
  const d = new Date(ts)
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes())
}
function syncAlarmTip() {
  const tip = mq('mAlarmTip')
  if (!tip) return
  const a = alarmInfo()
  if (!a) {
    tip.textContent = '闹钟：还没设'
    tip.classList.remove('on')
  } else {
    tip.textContent = '闹钟：还剩 ' + fmtLeft(a.left) + '（' + (a.desc ? a.desc + ' · ' : '') + fmtClock(a.at) + ' 提醒你）'
    tip.classList.add('on')
  }
}

function fire(t, at, now) {
  S.tasks.lastFired = S.tasks.lastFired || {}
  S.tasks.lastFired[t.id] = dateKey(now)
  const lead = Number(t.advance) || 0
  const soon = at.getTime() - now.getTime()
  startAlert({
    taskId: t.id,
    text: t.time + ' · ' + t.text,
    hint: lead > 0 && soon > 30000 ? '还有 ' + Math.round(soon / 60000) + ' 分钟' : '到点了，该做了',
    kind: 'task',
  })
  if (t.repeat === 'once') t.enabled = false
  api.saveTasks(S.tasks.items, S.tasks.lastFired)
}

function tick() {
  const now = new Date()
  if (S.menuOpen) syncAlarmTip()     // 菜单开着时每秒刷新闹钟剩余时间
  if (S.settings && (S.tasks.items || []).length) {
    for (const t of S.tasks.items) {
      if (!t.enabled || !t.text) continue
      if (!repeatMatch(t.repeat, now)) continue
      const at = taskDate(t, now)
      const remindAt = at.getTime() - (Number(t.advance) || 0) * 60000
      const delta = now.getTime() - remindAt
      if (delta >= 0 && delta < 90000 && (S.tasks.lastFired || {})[t.id] !== dateKey(now)) {
        fire(t, at, now)
        return
      }
    }
  }
  // 追提醒：没确认就每分钟再来一次
  if (S.alert && Date.now() - S.alert.lastPing >= PING_EVERY_MS) {
    pingAlert(false)
    return
  }
  // 稍后提醒 / 计时提醒到点
  if (S.snooze && Date.now() >= S.snooze.at) {
    const sn = S.snooze
    setSnooze(null)
    startAlert({ text: sn.text, hint: sn.hint || (sn.kind === 'timer' ? '你自己定的计时提醒' : '这是你刚才让我稍后提醒的'), kind: sn.kind })
    return
  }
  renderBubble(now)
}

/* ---------------- 与主进程同步 ---------------- */
function applyState(st) {
  if (!st) return
  const first = !S.settings
  S.settings = st.settings
  S.tasks = st.tasks || { items: [], lastFired: {} }
  /* 闹钟跨重启保留：主进程存了一份，启动时若还没到点就接着倒计时。
   * 已经过期的直接丢掉，免得一开机就补弹一堆提醒。 */
  if (first && !S.alarmRestored) {
    S.alarmRestored = true
    const a = st.alarm
    if (a && Number.isFinite(Number(a.at)) && Number(a.at) - Date.now() > 5000) {
      S.snooze = a
    } else if (a) {
      api.setAlarm(null)
    }
  }
  applyScale()
  applyAnchor(st.anchor || S.anchor)
  if (S.appliedChar !== curChar()) applyForm(false)   // 形象变了 → 立刻换立绘
  if (S.menuOpen) syncMenu()
  renderBubble(new Date())
  if (first && S.settings && S.settings.bubbleOn) {
    /* 日程还是空的 → 主动飘一次友好提示（只飘一次，看过就不再打扰） */
    const noTask = !(S.tasks.items || []).some((t) => t.enabled && String(t.text || '').trim())
    if (noTask && !S.settings.tipEmptyShown) {
      api.saveSettings({ tipEmptyShown: true })
      setTimeout(() => showBubble('list', 9), 1500)
    } else {
      setTimeout(() => showBubble('next'), 700)
    }
  }
}

api.onState(applyState)
api.onAnchor((a) => applyAnchor(a))
api.onFocusTask(() => showBubble('list'))
api.onCloseMenu(() => closeMenu())
api.onTestRemind(() => {
  const now = new Date()
  fire({
    id: '__test__',
    time: pad2(now.getHours()) + ':' + pad2(now.getMinutes()),
    text: '提醒测试 · 这就是到点的效果',
    repeat: 'daily',
    advance: 0,
    enabled: true,
  }, now, now)
})

applyForm(false)      // 常态形态
api.getState().then(applyState).catch(() => {})
setInterval(tick, 1000)