@echo off
chcp 65001 >nul
title 桌宠
pushd "%~dp0"

rem 唯一入口：本目录的 桌宠.exe（打包好的便携版）
if exist "桌宠.exe" (
  start "" "桌宠.exe"
  popd
  exit /b 0
)

rem 退路：装好的版本 / 开发态
if exist "node_modules\electron\dist\electron.exe" (
  echo [桌宠] 没找到 桌宠.exe，改用开发态启动（第一次会慢一点）
  start "" "node_modules\electron\dist\electron.exe" .
  popd
  exit /b 0
)

echo.
echo   [x] 没找到 桌宠.exe，也没有开发态依赖。请在本目录执行：
echo       npm install
echo       npm run dist
echo.
pause
popd
exit /b 1
