# 打包版冒烟（7 项）：用打包好的便携版 exe 跑一遍关键项，确认"打出来的东西也能用"
# 版本号在下面的 $Version 改
. "$PSScriptRoot\lib\common.ps1"

$ExeName = '桌宠.exe'
$profile = Join-Path $env:TEMP 'np-smoke-profile'
Remove-Item $profile -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $profile -Force | Out-Null

Stop-AllPet
Start-PackagedPet $profile
Wait-Pet 15

Say '===== 打包版冒烟（桌宠.exe）====='
$d = ToJson (E 'defaults.js')
Check '打包版同样是空日程 + 默认不自启' ($d.items -eq 0 -and $d.autoStart -eq $false) ('items=' + $d.items + ' autoStart=' + $d.autoStart)
Check '打包版空日程有友好提示' ($d.tipEmptyShown -eq $true -and $d.emptyMain -match '还没有日程') ('main=' + $d.emptyMain)

$s = ToJson (E 'bubble-on.js')
Check '打包版能正常渲染气泡' ($s.cls -match 'on') ('class=' + $s.cls)

$ly = ToJson (E 'menu-layout.js')
Check '打包版菜单排版正常（不换行/不裁切/不滚动）' ((@($ly.wrapped).Count -eq 0) -and (@($ly.clipped).Count -eq 0) -and ($ly.scroll[0] -le ($ly.scroll[1] + 1))) ('wrapped=' + (@($ly.wrapped) -join ';') + ' clipped=' + (@($ly.clipped) -join ';') + ' scroll=' + ($ly.scroll -join '/'))

$m = ToJson (E 'menu.js')
Check '打包版菜单完整（形象按钮可见）' ($m.outside -eq 0 -and @($m.chars | Where-Object { $_ -lt 0 }).Count -eq 0) ('outside=' + $m.outside + ' y=' + ($m.chars -join ','))

$null = E 'set-alarm-long.js'
Start-Sleep -Milliseconds 1200
$al = $null
$al = ToJson (ReadText (Join-Path $profile 'alarm.json'))
Check '打包版能把闹钟写进 alarm.json' ($al -and $al.desc -eq '重启测试') ('desc=' + $(if ($al) { $al.desc } else { 'null' }))

Stop-AllPet
Start-PackagedPet $profile
Wait-Pet 15
$r = ToJson (E 'restart-check.js')
Check '打包版闹钟跨重启恢复' (($r.desc -eq '重启测试') -and ($r.left -gt 200)) ('desc=' + $r.desc + ' 剩余=' + $r.left + 's')

$null = E 'set-alarm-expired.js'
Start-Sleep -Milliseconds 800
Stop-AllPet
Finish '打包版冒烟'