var rows = document.querySelectorAll('.tr')
var last = rows[rows.length - 1]
JSON.stringify({
  rows: rows.length,
  advance: last ? last.querySelector('[data-k=advance]').value : null,
  count: document.getElementById('taskCount').textContent
})