setSnooze({
  at: Date.now() + 240000,
  text: '\u91cd\u542f\u6d4b\u8bd5',
  hint: '4 \u5206\u949f\u5230\u5566',
  desc: '\u91cd\u542f\u6d4b\u8bd5',
  kind: 'timer'
})
JSON.stringify({ set: S.snooze ? S.snooze.desc : null })