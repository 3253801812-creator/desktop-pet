/* 新装默认值核查：日程是否为空、是否开机自启、空日程的友好提示是否触发过
 * 顺便把气泡强制切到「今天清单」抓一次空日程文案，再恢复原状态（不影响后续断言）。 */
api.getState().then(function (st) {
  var items = (st.tasks && st.tasks.items) || []
  var usable = items.filter(function (t) { return t.enabled && String(t.text || "").trim() }).length

  S.mode = "list"
  S.lastSig = ""
  renderBubble(new Date())
  var title = document.getElementById("bTitle").textContent
  var main = document.getElementById("bMain").textContent
  var hint = document.getElementById("bHint").textContent

  var out = {
    items: items.length,
    usable: usable,
    autoStart: st.settings.autoStart,
    tipEmptyShown: st.settings.tipEmptyShown,
    title: title,
    emptyMain: main,
    emptyHint: hint,
    dataDir: st.dataDir
  }

  S.mode = "off"
  S.lastSig = ""
  renderBubble(new Date())
  return JSON.stringify(out)
})
