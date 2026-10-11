/* 主进程设置补丁：非法数值要回落，未知键要丢弃 */
api.saveSettings({ vol: 'abc', evilKey: 'x', scale: 1 }).then(function (s) {
  return JSON.stringify({
    vol: s.vol,
    evil: s.evilKey === undefined ? null : s.evilKey,
    ok: s.ok !== false
  })
})