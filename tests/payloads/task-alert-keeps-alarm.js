startAlert({ text: 'TASK-X', hint: 'h', kind: 'task' })
JSON.stringify({
  snooze: S.snooze ? S.snooze.desc : null,
  mode: S.mode,
  alert: S.alert ? S.alert.text : null
})