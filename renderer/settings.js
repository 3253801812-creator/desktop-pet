/* ===========================================================================
 * 设置窗口逻辑：桌宠设置（即时生效）+ 时段任务编辑（显式保存）
 *
 * 草稿模型：任务表的改动先落在 draft 里，点「保存任务」才落盘。
 * dirty = 草稿与已保存内容是否不一致（用来防止广播把未保存的编辑冲掉）。
 * =========================================================================== */
'use strict'
const api = window.petAPI
const q = (id) => document.getElementById(id)
const listEl = q('list')
const taskHintEl = q('taskHint')

let S = { settings: null, tasks: { items: [], lastFired: {} }, dataDir: '', backup: null }
let draft = []          // 任务编辑草稿
let dirty = false       // 草稿有未保存改动

function hint(node, text) {
  if (!node) return
  node.textContent = text
  node.classList.add('show')
  clearTimeout(node._t)
  node._t = setTimeout(() => node.classList.remove('show'), 1600)
}
function clone(items) {
  return JSON.parse(JSON.stringify(items || []))
}
const timeOk = (v) => /^\d{1,2}:\d{2}$/.test(String(v || '').trim())

/* ---------------- 设置项（即时生效） ---------------- */
function renderSettings() {
  const st = S.settings
  if (!st) return
  q('scale').value = String(st.scale)
  q('scaleVal').textContent = Number(st.scale).toFixed(2)
  q('vol').value = String(st.vol)
  q('volVal').textContent = Math.round(st.vol * 100) + '%'
  q('soundSet').value = st.soundSet
  q('remindSound').value = st.remindSound
  q('bubbleSec').value = String(st.bubbleSec)
  q('bubbleSecVal').textContent = st.bubbleSec > 0 ? st.bubbleSec + ' 秒' : '常驻'
  q('snoozeMin').value = String(Math.max(1, Math.round(Number(st.snoozeMin) || 5)))
  q('soundOn').checked = !!st.soundOn
  q('bubbleOn').checked = !!st.bubbleOn
  q('snapOn').checked = !!st.snapOn
  q('alwaysOnTop').checked = !!st.alwaysOnTop
  q('notifyOn').checked = !!st.notifyOn
  q('autoStart').checked = !!st.autoStart
  q('petVisible').checked = !!st.petVisible
}

const saveSettings = (patch) => api.saveSettings(patch).catch(() => {})
/* 滑块：拖动时只更新数字，松手后落盘（避免拖一次写几十遍磁盘 + 广播） */
function bindRange(id, valId, fmt, key) {
  const el = q(id)
  const out = q(valId)
  let timer = 0
  const show = () => { out.textContent = fmt(Number(el.value)) }
  el.addEventListener('input', () => {
    show()
    clearTimeout(timer)
    timer = setTimeout(() => saveSettings({ [key]: Number(el.value) }), 160)
  })
  el.addEventListener('change', () => {
    clearTimeout(timer)
    show()
    saveSettings({ [key]: Number(el.value) })
  })
}
bindRange('scale', 'scaleVal', (v) => v.toFixed(2), 'scale')
bindRange('vol', 'volVal', (v) => Math.round(v * 100) + '%', 'vol')
bindRange('bubbleSec', 'bubbleSecVal', (v) => (v > 0 ? v + ' 秒' : '常驻'), 'bubbleSec')

q('soundSet').addEventListener('change', (e) => saveSettings({ soundSet: e.target.value }))
q('remindSound').addEventListener('change', (e) => saveSettings({ remindSound: e.target.value }))
q('snoozeMin').addEventListener('change', (e) => saveSettings({ snoozeMin: Number(e.target.value) }))
const CHK = {
  soundOn: 'soundOn', bubbleOn: 'bubbleOn', snapOn: 'snapOn', alwaysOnTop: 'alwaysOnTop',
  notifyOn: 'notifyOn', autoStart: 'autoStart', petVisible: 'petVisible',
}
Object.keys(CHK).forEach((id) => {
  q(id).addEventListener('change', (e) => saveSettings({ [CHK[id]]: e.target.checked }))
})
q('testRemind').addEventListener('click', () => {
  hint(q('saveHint'), '已向桌宠发送一条测试提醒')
  api.testRemind()
})

/* ---------------- 时段任务 ---------------- */
function renderCount() {
  const cnt = q('taskCount')
  if (!cnt) return
  const enabled = draft.filter((t) => t.enabled !== false && String(t.text || '').trim()).length
  cnt.textContent = draft.length
    ? '共 ' + draft.length + ' 条 · 启用 ' + enabled + ' 条' + (dirty ? ' · 未保存' : '')
    : ''
}
function renderEmpty() {
  const d = document.createElement('div')
  d.className = 'empty'
  const onDisk = (S.tasks.items || []).length
  d.textContent = onDisk
    ? '列表为空（磁盘上还有 ' + onDisk + ' 条）：点「放弃改动」撤回，或者 '
    : '还没有任务：点下面「＋ 新增一条」自己加，或者 '
  const b = document.createElement('button')
  b.className = 'btn link'
  b.id = 'addDefaults'
  b.textContent = onDisk ? '用 3 条示例任务替换现在的内容' : '一键加回 3 条示例任务'
  b.addEventListener('click', () => {
    api.defaultTasks().then((tasks) => {
      S.tasks = tasks
      draft = clone(tasks.items)
      dirty = false
      renderTasks()
      hint(taskHintEl, '已写入 ' + draft.length + ' 条示例任务')
    }).catch(() => hint(taskHintEl, '加回失败'))
  })
  d.appendChild(b)
  return d
}
function buildRow(t, i) {
  const row = document.createElement('div')
  row.className = 'tr'
  row.dataset.row = String(i)
  row.innerHTML = `
      <input type="time" data-k="time" aria-label="提醒时间">
      <input type="text" data-k="text" placeholder="要干的事…" maxlength="200" aria-label="要干的事">
      <input type="number" min="0" max="120" data-k="advance" title="提前几分钟提醒" aria-label="提前几分钟">
      <select data-k="repeat" aria-label="重复方式">
        <option value="daily">每天</option>
        <option value="workday">工作日</option>
        <option value="weekend">周末</option>
        <option value="once">仅一次</option>
      </select>
      <input type="checkbox" data-k="enabled" title="启用" aria-label="启用这一条">
      <button class="del" title="删除这一条" aria-label="删除这一条">✕</button>`
  // 一律用 DOM 赋值，不做 innerHTML 插值：文本里的 & / " 不会被当成实体改写
  row.querySelector('[data-k=time]').value = timeOk(t.time) ? t.time : '09:00'
  row.querySelector('[data-k=text]').value = String(t.text || '')
  row.querySelector('[data-k=advance]').value = String(Math.min(120, Math.max(0, Math.round(Number(t.advance) || 0))))
  row.querySelector('[data-k=repeat]').value = t.repeat || 'daily'
  row.querySelector('[data-k=enabled]').checked = t.enabled !== false
  row.querySelectorAll('[data-k]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const k = inp.getAttribute('data-k')
      if (k === 'advance') {
        // 夹取后回写输入框，免得界面显示 999 实际存 120
        const v = Math.min(120, Math.max(0, Math.round(Number(inp.value) || 0)))
        t.advance = v
        if (inp.value !== String(v)) inp.value = String(v)
      } else if (k === 'enabled') {
        t.enabled = inp.checked
      } else {
        t[k] = inp.value
      }
      dirty = true
      renderCount()
    })
  })
  row.querySelector('.del').addEventListener('click', () => {
    draft.splice(i, 1)
    dirty = true
    renderTasks()
    // 删完把焦点放到相邻行的同一列，键盘用户不用从头 Tab
    const rows = listEl.querySelectorAll('.tr')
    const next = rows[Math.min(i, rows.length - 1)]
    const focusable = next && next.querySelector('.del')
    if (focusable) focusable.focus()
    else q('add').focus()
  })
  return row
}
function renderTasks() {
  listEl.innerHTML = ''
  renderCount()
  if (!draft.length) listEl.appendChild(renderEmpty())
  draft.forEach((t, i) => listEl.appendChild(buildRow(t, i)))
}

q('add').addEventListener('click', () => {
  draft.push({
    id: 't' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    time: '09:00', text: '', repeat: 'daily', advance: 5, enabled: true,
  })
  dirty = true
  renderTasks()
  const inputs = listEl.querySelectorAll('input[type=text]')
  if (inputs.length) inputs[inputs.length - 1].focus()
})
q('save').addEventListener('click', () => {
  const kept = []
  let fixed = 0
  draft.forEach((t) => {
    if (!String(t.text || '').trim()) return
    if (!timeOk(t.time)) { fixed++; t.time = '09:00' }      // 与主进程 normTime 的回退一致
    kept.push(t)
  })
  const dropped = draft.length - kept.length
  api.saveTasks(kept, S.tasks.lastFired || {}).then((tasks) => {
    S.tasks = tasks
    draft = clone(tasks.items)
    dirty = false
    renderTasks()
    const bits = []
    if (dropped) bits.push('丢弃 ' + dropped + ' 条空任务')
    if (fixed) bits.push(fixed + ' 条时间不合法已按 09:00 保存')
    hint(taskHintEl, bits.length ? '已保存（' + bits.join('，') + '）' : '已保存 ✓')
  }).catch(() => hint(taskHintEl, '保存失败'))
})
q('revert').addEventListener('click', () => {
  draft = clone(S.tasks.items)
  dirty = false
  renderTasks()
  hint(taskHintEl, '已放弃改动')
})
/* 恢复上一份任务备份（每次覆盖 tasks.json 前都会自动留一份 .bak） */
q('restore').addEventListener('click', () => {
  api.restoreTasksBackup().then((r) => {
    if (!r || !r.ok) { hint(taskHintEl, '没有可恢复的备份'); syncRestore(); return }
    S.tasks = r.tasks
    draft = clone(r.tasks.items)
    dirty = false
    renderTasks()
    syncRestore()
    hint(taskHintEl, '已从备份恢复 ' + draft.length + ' 条')
  }).catch(() => hint(taskHintEl, '恢复失败'))
})
function syncRestore() {
  const b = q('restore')
  if (!b) return
  const info = S.backup
  if (info && info.count > 0) {
    b.hidden = false
    b.textContent = '↩ 恢复上次备份（' + info.count + ' 条）'
    b.title = '备份时间：' + String(info.at || '').replace('T', ' ').slice(0, 16)
  } else {
    b.hidden = true
  }
}

/* ---------------- 初始化 ---------------- */
function applyState(st) {
  if (!st) return
  const prevItems = JSON.stringify((S.tasks && S.tasks.items) || [])
  S.settings = st.settings
  S.tasks = st.tasks || { items: [], lastFired: {} }
  S.dataDir = st.dataDir || ''
  S.backup = st.backup || null
  renderSettings()
  syncRestore()
  // 只有"没有未保存改动"时才用新状态刷新草稿，绝不冲掉用户正在编辑的内容
  const nextItems = JSON.stringify(S.tasks.items)
  if (dirty && nextItems !== prevItems) {
    hint(taskHintEl, '任务在别处被改动过；你点「保存任务」会以当前草稿为准')
  }
  if (!dirty) {
    draft = clone(S.tasks.items)
    renderTasks()
  } else {
    renderCount()
  }
  q('foot').textContent = '数据位置：' + (S.dataDir || '%APPDATA%\\notepad-pet-app') +
    '（settings.json / tasks.json / window.json / alarm.json）'
}

api.onState(applyState)
api.getState().then(applyState).catch(() => hint(taskHintEl, '状态读取失败，请关掉设置窗口重开'))