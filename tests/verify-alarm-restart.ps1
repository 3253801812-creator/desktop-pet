# 闹钟跨重启验收（4 项）：落盘、重启恢复、过期不补弹、过期文件清理
. "$PSScriptRoot\lib\common.ps1"

$profile = Join-Path $env:TEMP 'np-alarm-profile'
Remove-Item $profile -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $profile -Force | Out-Null

Stop-AllPet
Start-DevPet $profile
Wait-Pet 12

Say '--- 设一个 4 分钟后的闹钟（带描述），确认已落盘 ---'
$r = ToJson (E 'set-alarm-long.js')
Say ('  设置结果: ' + $r.set)
Start-Sleep -Milliseconds 1200
$al = $null
try { $al = (Get-Content (Join-Path $profile 'alarm.json') -Raw -Encoding UTF8 | ConvertFrom-Json) } catch {}
Check 'alarm.json 已写入' ($al -and $al.desc -eq '重启测试') ('desc=' + $(if ($al) { $al.desc } else { 'null' }))

Say '--- 真的杀掉进程，再重新启动 ---'
Stop-AllPet
Say ('  剩余进程: ' + @(Get-Process | Where-Object { $_.ProcessName -like '*记事本*' -or $_.ProcessName -eq 'electron' }).Count)
Start-DevPet $profile
Wait-Pet 13

$r2 = ToJson (E 'restart-check.js')
Check '重启后闹钟被恢复（描述 + 剩余时间）' (($r2.desc -eq '重启测试') -and ($r2.left -gt 200) -and ($r2.left -le 240)) ('desc=' + $r2.desc + ' 剩余=' + $r2.left + 's')

Say '--- 过期闹钟不该在启动时补弹 ---'
$null = E 'set-alarm-expired.js'
Start-Sleep -Milliseconds 1200
Stop-AllPet
Start-DevPet $profile
Wait-Pet 13

$r3 = ToJson (E 'restart-check.js')
Check '过期闹钟被丢弃（不会一开机补弹）' (($r3.desc -eq $null) -and ($r3.alert -eq $null)) ('snooze=' + $r3.desc + ' mode=' + $r3.mode + ' alert=' + $r3.alert)
$left = ReadText (Join-Path $profile 'alarm.json')
Check '过期的 alarm.json 已被清掉' ($left -match 'null') ('file=' + ($left -replace '\s+', ''))

Stop-AllPet
Check '结束后没有残留实例' (@(Get-Process | Where-Object { $_.ProcessName -like '*记事本*' -or $_.ProcessName -eq 'electron' }).Count -eq 0) '0 个'

Finish '闹钟跨重启验收'