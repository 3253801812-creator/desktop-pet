openMenu()
document.getElementById('mAlarmMin').value = '3'
document.getElementById('mAlarmText').value = '\u53bb\u63a5\u6c34'
document.getElementById('mAlarmSet').click()
JSON.stringify({ desc: S.snooze ? S.snooze.desc : null, kind: S.snooze ? S.snooze.kind : null })