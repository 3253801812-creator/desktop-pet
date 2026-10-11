# 一键跑全部验收：语法检查 → 综合验收 → 闹钟跨重启
# 用法： npm run test      （或  powershell -ExecutionPolicy Bypass -File tests\run-all.ps1）
$ErrorActionPreference = 'Continue'
$Root = Split-Path $PSScriptRoot -Parent
$fail = 0

Write-Host '===== 1/3 语法检查（node --check）====='
foreach ($f in @('main.js', 'preload.js', 'renderer\pet.js', 'renderer\settings.js')) {
  $out = & node --check (Join-Path $Root $f) 2>&1
  if ($LASTEXITCODE -eq 0) { Write-Host ('  [OK]   ' + $f) }
  else { Write-Host ('  [FAIL] ' + $f + '  ' + ($out -join ' ')) -ForegroundColor Red; $fail++ }
}

Write-Host ''
Write-Host '===== 2/3 综合验收（20 项）====='
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'verify-audit.ps1')
if ($LASTEXITCODE -ne 0) { $fail++ }

Write-Host ''
Write-Host '===== 3/3 闹钟跨重启（5 项）====='
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'verify-alarm-restart.ps1')
if ($LASTEXITCODE -ne 0) { $fail++ }

Write-Host ''
if ($fail -eq 0) { Write-Host '===== 全部通过 =====' -ForegroundColor Green; exit 0 }
Write-Host ('===== 有 ' + $fail + ' 个环节失败 =====') -ForegroundColor Red
Write-Host '（提示：跑测试会结束所有桌宠实例，跑完需要自己双击 dist\记事本桌宠-便携版-*.exe 重新启动）'
exit 1