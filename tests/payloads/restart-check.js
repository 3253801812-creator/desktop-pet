/* 重启后：闹钟还剩多久、有没有被补弹 */
syncAlarmTip()
JSON.stringify({
  desc: S.snooze ? S.snooze.desc : null,
  left: S.snooze ? Math.round((S.snooze.at - Date.now()) / 1000) : null,
  mode: S.mode,
  alert: S.alert ? S.alert.text : null,
  tip: document.getElementById('mAlarmTip').textContent
})