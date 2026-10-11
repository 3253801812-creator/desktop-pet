/* 菜单排版自检：每行是否被挤成两行、文字是否被裁切、是否需要内部滚动 */
if (!S.menuOpen) openMenu()
var menu = document.getElementById("menu")
var mr = menu.getBoundingClientRect()
var rows = [].slice.call(menu.querySelectorAll(".m-row, .m-chk, .m-btn, .m-seg"))
var wrapped = [], clipped = [], outside = []
rows.forEach(function (r) {
  var b = r.getBoundingClientRect()
  if (b.height > 34) wrapped.push(((r.textContent || "").trim().slice(0, 14) || r.id) + "=" + Math.round(b.height))
  ;[].slice.call(r.children).forEach(function (c) {
    if (c.clientWidth > 0 && c.scrollWidth > c.clientWidth + 1) {
      clipped.push((c.id || c.className || c.tagName) + " " + c.scrollWidth + ">" + c.clientWidth)
    }
  })
  if (b.left < mr.left - 0.5 || b.right > mr.right + 0.5) outside.push((r.textContent || "").trim().slice(0, 10))
})
JSON.stringify({
  rows: rows.length, wrapped: wrapped, clipped: clipped, outside: outside,
  scroll: [menu.scrollHeight, menu.clientHeight],
  menu: [Math.round(mr.width), Math.round(mr.height)],
  win: [window.innerWidth, window.innerHeight]
})
