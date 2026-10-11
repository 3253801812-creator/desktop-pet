/* 慢点 10 下：形态不该变（间隔 2 秒 > RAPID_MS）
 * 先把上一条用例可能留下的提醒状态清掉，否则 onPetClick 会直接早退 */
S.alert = null
S.mode = 'off'
S.lastSig = ''
renderBubble(new Date())

S.form = 'a'
S.clicks = 0
S.lastClickAt = 0
for (var i = 0; i < 10; i++) { S.lastClickAt = Date.now() - 2000; onPetClick() }
JSON.stringify({ form: S.form, clicks: S.clicks })