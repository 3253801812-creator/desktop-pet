# 综合验收（20 项）：新装默认（空日程 / 不自启 / 友好提示）、菜单几何、菜单排版、位置夹取、闹钟落盘与不被清、点击语义、气泡开关、设置白名单、草稿保护
# 全部走 CDP 断言，不合成鼠标事件、不碰真实数据。
. "$PSScriptRoot\lib\common.ps1"

$profile = Join-Path $env:TEMP 'np-audit-profile'
Remove-Item $profile -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $profile -Force | Out-Null
# 故意写一份"屏幕外"的位置，验证启动时会被夹回可见区域
[System.IO.File]::WriteAllText((Join-Path $profile 'window.json'), '{"x":-9000,"y":-9000,"anchor":"br"}', [System.Text.Encoding]::UTF8)

Stop-AllPet
Start-DevPet $profile
Wait-Pet 12

Say '===== 0. 新装默认：日程为空、不开机自启、空日程有友好提示 ====='
$d0 = ToJson (E 'defaults.js')
Check '新装日程默认为空（不塞示例任务）' ($d0.items -eq 0 -and $d0.usable -eq 0) ('items=' + $d0.items + ' usable=' + $d0.usable)
Check '新装默认不开机自启' ($d0.autoStart -eq $false) ('autoStart=' + $d0.autoStart)
Check '空日程的友好提示已触发且文案到位' ($d0.tipEmptyShown -eq $true -and $d0.emptyMain -match '还没有日程') ('tip=' + $d0.tipEmptyShown + ' main=' + $d0.emptyMain)

Say '===== 1. 屏幕外的 window.json 会被夹回可见区 ====='
$w = ToJson (ERaw 'state')
Check '启动位置不再跑到屏幕外' ($w.win[0] -gt -1000 -and $w.win[1] -gt -1000) ('win=' + ($w.win -join ','))

Say '===== 2. 菜单必须整块在窗口内 ====='
$m = ToJson (E 'menu.js')
Check '菜单完整落在窗口内（0 个元素出界）' ($m.outside -eq 0) ('outside=' + $m.outside + ' h=' + $m.menu.h)
Check '形象按钮可见（y>=0）' (@($m.chars | Where-Object { $_ -lt 0 }).Count -eq 0) ('y=' + ($m.chars -join ','))

Say '===== 3. 闹钟带描述 → 落盘 alarm.json ====='
$null = E 'set-alarm.js'
Start-Sleep -Milliseconds 1200
$al = $null
$al = ToJson (ReadText (Join-Path $profile 'alarm.json'))
Check 'alarm.json 里存了描述与排期' ($al -and $al.desc -eq '去接水' -and $al.kind -eq 'timer') ('desc=' + $al.desc + ' kind=' + $al.kind)

Say '===== 4. 时段任务到点提醒不该清掉用户刚设的闹钟 ====='
$a4 = ToJson (E 'task-alert-keeps-alarm.js')
Check '任务提醒后闹钟仍在' ($a4.snooze -eq '去接水') ('snooze=' + $a4.snooze + ' alert=' + $a4.alert)

Say '===== 5. 提醒中点击 → 仍然是提醒页 ====='
$a5 = ToJson (E 'alert-not-stolen.js')
Check '提醒中点击回到提醒页' (($a5.mode -eq 'alert') -and ($a5.main -eq 'ALERT-Y')) ('mode=' + $a5.mode + ' main=' + $a5.main)

Say '===== 6. 慢慢点 10 下不换形态 / 连点 10 下换形态 ====='
$a6 = ToJson (E 'clicks-slow.js')
Check '慢点 10 下形态不变' ($a6.form -eq 'a') ('form=' + $a6.form + ' clicks=' + $a6.clicks)
$a7 = ToJson (E 'clicks-rapid.js')
Check '连点 10 下换形态' ($a7.form -eq 'b') ('form=' + $a7.form)

Say '===== 7. 关掉再打开「显示气泡」应立即恢复 ====='
$null = E 'bubble-off.js'
Start-Sleep -Milliseconds 600
$a8 = ToJson (E 'bubble-on.js')
Check '重开气泡立即显示（不再等 1 分钟）' ($a8.cls -match 'on') ('class=' + $a8.cls)

Say '===== 8. 主进程设置补丁：非法值回落、未知键丢弃 ====='
$a9 = ToJson (E 'settings-limits.js')
Check 'vol 非法值回落 0、未知键被丢弃' (($a9.vol -eq 0) -and ($a9.evil -eq $null)) ('vol=' + $a9.vol + ' evil=' + $a9.evil)

Say '===== 9. 设置窗口：草稿保护 / 提前分钟回写 / 未保存标识 ====='
$null = E 'open-settings.js'
Start-Sleep -Seconds 4
$null = ES 'st-add-row.js'
Start-Sleep -Milliseconds 700
$null = ES 'st-set-advance.js'
Start-Sleep -Milliseconds 500
$s1 = ToJson (ES 'st-state.js')
Check '提前分钟数夹取后回写输入框' ($s1.advance -eq '120') ('advance=' + $s1.advance)
Check '计数显示「未保存」' ($s1.count -match '未保存') ('count=' + $s1.count)
# 触发几次主进程广播（改设置会广播全量状态）→ 草稿不能被冲掉
$null = E 'bubble-off.js'
Start-Sleep -Milliseconds 900
$null = E 'bubble-on.js'
Start-Sleep -Milliseconds 1200
$s2 = ToJson (ES 'st-state.js')
Check '广播不会冲掉未保存草稿' (($s2.rows -eq $s1.rows) -and ($s2.advance -eq '120')) ('rows=' + $s2.rows + ' advance=' + $s2.advance)
$null = ES 'st-revert.js'
Start-Sleep -Milliseconds 700
$s3 = ES 'st-row-count.js'
Check '放弃改动后回到已保存的 0 条（默认空日程）' ($s3 -eq '0') ('rows=' + $s3)

Say '===== 10. 右键菜单排版：不许换行 / 裁切 / 内部滚动 ====='
$ly = ToJson (E 'menu-layout.js')
Check '菜单每一行都是单行（没有被挤换行）' (@($ly.wrapped).Count -eq 0) ('wrapped=' + (@($ly.wrapped) -join ';'))
Check '菜单里没有文字被裁切' (@($ly.clipped).Count -eq 0) ('clipped=' + (@($ly.clipped) -join ';'))
Check '菜单不需要内部滚动' ($ly.scroll[0] -le ($ly.scroll[1] + 1)) ('scroll=' + ($ly.scroll -join '/') + ' 行数=' + $ly.rows)

Stop-AllPet
Finish '综合验收'