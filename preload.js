/**
 * preload：把主进程能力以最小接口暴露给渲染进程（contextIsolation 打开，无 nodeIntegration）
 */
'use strict'
const { contextBridge, ipcRenderer } = require('electron')

// 统一的订阅封装：返回取消函数，重复订阅时不会让同一个回调叠加执行
function sub(channel, handler) {
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.off(channel, handler)
}

contextBridge.exposeInMainWorld('petAPI', {
  getState: () => ipcRenderer.invoke('state:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:patch', patch),
  saveTasks: (items, lastFired) => ipcRenderer.invoke('tasks:save', { items, lastFired }),
  restoreTasksBackup: () => ipcRenderer.invoke('tasks:restore-backup'),
  defaultTasks: () => ipcRenderer.invoke('tasks:defaults'),
  // 闹钟/计时排期：落盘一份，退出重开还能接着倒计时（null = 清掉）
  setAlarm: (alarm) => ipcRenderer.invoke('alarm:set', alarm || null),

  // 拖拽：坐标由主进程用真实光标算，渲染进程只管通知开始/移动/结束
  dragStart: () => ipcRenderer.send('pet:drag-start'),
  dragMove: () => ipcRenderer.send('pet:drag-move'),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),

  // 菜单开关状态告知主进程（主进程据此判定光标是否在菜单上 + 鼠标离开时自动收起）
  reportMenu: (open, rect) => ipcRenderer.send('menu:state', { open: !!open, rect: rect || null }),

  openSettings: () => ipcRenderer.send('settings:open'),
  hidePet: () => ipcRenderer.send('pet:hide'),
  closeWindow: () => ipcRenderer.send('window:close'),
  quit: () => ipcRenderer.send('app:quit'),
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  hit: (rect) => ipcRenderer.send('pet:hit', rect),
  onDoubleClick: (cb) => ipcRenderer.on('pet:double-click', () => cb()),
  testRemind: () => ipcRenderer.send('test:remind'),

  // 事件订阅统一返回取消函数，避免重复订阅时回调叠加
  onState: (cb) => sub('state:changed', (_e, st) => cb(st)),
  onAnchor: (cb) => sub('anchor', (_e, a) => cb(a)),
  onFocusTask: (cb) => sub('focus-task', () => cb()),
  onTestRemind: (cb) => sub('test-remind', () => cb()),
  onCloseMenu: (cb) => sub('menu:close', () => cb()),
  onDragResult: (cb) => sub('pet:drag-result', (_e, moved) => cb(!!moved)),
})