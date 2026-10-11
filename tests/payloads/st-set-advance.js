/* 新行的「提前」填 999 并触发 input：应该被夹到 120 并且回写到输入框 */
var rows = document.querySelectorAll('.tr')
var last = rows[rows.length - 1]
var adv = last.querySelector('[data-k=advance]')
adv.value = '999'
adv.dispatchEvent(new Event('input', { bubbles: true }))
JSON.stringify({ rows: rows.length })