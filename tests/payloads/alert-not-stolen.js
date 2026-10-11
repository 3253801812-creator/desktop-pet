/* 提醒追讨中点桌宠：应该留在提醒页，而不是被切到「接下来」 */
startAlert({ text: 'ALERT-Y', hint: 'h', kind: 'task' })
S.mode = 'alert'
cycleBubble()
JSON.stringify({
  mode: S.mode,
  alert: S.alert ? S.alert.text : null,
  main: document.getElementById('bMain').textContent
})