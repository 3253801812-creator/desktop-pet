# 公共助手：三个验收脚本都点这个（用 . "$PSScriptRoot\lib\common.ps1" 引入）
$ErrorActionPreference = 'Continue'
# 注意：这个文件在 tests\lib\ 里，所以上一层才是 tests\，再上一层才是项目根
$TestsDir = Split-Path $PSScriptRoot -Parent
$Root = Split-Path $TestsDir -Parent
$Payload = Join-Path $TestsDir 'payloads'
$CdpEval = Join-Path $PSScriptRoot 'cdp-eval.mjs'
$Port = if ($env:NP_PORT) { $env:NP_PORT } else { '9222' }
$script:Pass = 0
$script:Fail = 0

function Say($t) { Write-Host $t }

# 在桌宠页里求值（$file 是 payloads 下的文件名）
function E([string]$file) {
  $p = Join-Path $Payload $file
  return ((node $CdpEval ('@' + $p) 2>&1) -join '') -replace "`r?`n", ''
}
# 在设置页里求值
function ES([string]$file) {
  $p = Join-Path $Payload $file
  return ((node $CdpEval ('@' + $p) 'settings.html' 2>&1) -join '') -replace "`r?`n", ''
}
# 原始表达式（内置的 state 速览等）
function ERaw([string]$expr) {
  return ((node $CdpEval $expr 2>&1) -join '') -replace "`r?`n", ''
}
# 读文件：读不到返回空串，绝不把错误对象混进结果
function ReadText([string]$path) {
  try {
    if (-not (Test-Path $path)) { return '' }
    return (Get-Content $path -Raw -Encoding UTF8 -ErrorAction Stop)
  } catch { return '' }
}

function ToJson($text) {
  try { return $text | ConvertFrom-Json } catch { return $null }
}

function Check([string]$name, [bool]$ok, [string]$detail) {
  if ($ok) { $script:Pass++; Write-Host ('  [OK]   ' + $name + '   ' + $detail) }
  else { $script:Fail++; Write-Host ('  [FAIL] ' + $name + '   ' + $detail) -ForegroundColor Red }
}

# 结束所有桌宠实例（只匹配桌宠自己，绝不碰 dsh 等其它进程）
function Stop-AllPet {
  Get-Process | Where-Object { $_.ProcessName -like '*记事本*' -or $_.ProcessName -eq 'electron' } |
    Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3
}

# 启动开发态 Electron（用当前源码，不带打包产物）
function Start-DevPet([string]$profile) {
  New-Item -ItemType Directory -Path $profile -Force | Out-Null
  $env:NOTEPAD_PET_USERDATA = $profile
  $env:NOTEPAD_PET_NO_AUTOSTART = '1'   # 验收跑动不碰使用者真实的开机自启
  Start-Process -FilePath (Join-Path $Root 'node_modules\electron\dist\electron.exe') `
    -ArgumentList ('--remote-debugging-port=' + $Port), '.' -WorkingDirectory $Root
}
# 启动打包好的便携版
function Start-PackagedPet([string]$profile, [switch]$NoDebugPort) {
  New-Item -ItemType Directory -Path $profile -Force | Out-Null
  $env:NOTEPAD_PET_USERDATA = $profile
  $env:NOTEPAD_PET_NO_AUTOSTART = '1'   # 同上
  $exe = Join-Path $Root '桌宠.exe'
  if (-not (Test-Path $exe)) { throw ('找不到打包产物: ' + $exe) }
  if ($NoDebugPort) { Start-Process -FilePath $exe }
  else { Start-Process -FilePath $exe -ArgumentList ('--remote-debugging-port=' + $Port) }
}

function Wait-Pet([int]$seconds = 14) { Start-Sleep -Seconds $seconds }

function Finish([string]$title) {
  Remove-Item Env:\NOTEPAD_PET_USERDATA -ErrorAction SilentlyContinue
  Remove-Item Env:\NOTEPAD_PET_NO_AUTOSTART -ErrorAction SilentlyContinue
  Say ''
  Say ('===== ' + $title + ': pass ' + $script:Pass + ' / fail ' + $script:Fail + ' =====')
  if ($script:Fail -gt 0) { exit 1 } else { exit 0 }
}