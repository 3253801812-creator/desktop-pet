openMenu()
JSON.stringify({
  menu: (function () {
    var r = document.getElementById('menu').getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y), bottom: Math.round(r.bottom) }
  })(),
  outside: [].filter.call(document.querySelectorAll('#menu, #menu *'), function (e) {
    var r = e.getBoundingClientRect()
    return r.width > 0 && (r.top < 0 || r.bottom > innerHeight || r.right > innerWidth)
  }).length,
  chars: [].map.call(document.querySelectorAll('.m-seg-btn'), function (b) {
    return Math.round(b.getBoundingClientRect().y)
  })
})