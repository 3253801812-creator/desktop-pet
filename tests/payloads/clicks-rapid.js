/* 连点 10 下：应该换形态（间隔 0 < RAPID_MS）
 * 同样先清掉提醒状态 */
S.alert = null
S.mode = 'off'
S.lastSig = ''
renderBubble(new Date())

S.form = 'a'
S.clicks = 0
S.lastClickAt = 0
for (var i = 0; i < 10; i++) { S.lastClickAt = Date.now(); onPetClick() }
JSON.stringify({ form: S.form, clicks: S.clicks })