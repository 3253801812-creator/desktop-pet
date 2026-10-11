# 桌宠（记事本桌宠）

<p align="center">
  <a href="https://github.com/3253801812-creator/desktop-pet/releases"><img src="https://img.shields.io/github/v/release/3253801812-creator/desktop-pet?sort=semver&color=2ea44f&label=release" alt="release"></a>
  <a href="https://github.com/3253801812-creator/desktop-pet/actions"><img src="https://img.shields.io/github/actions/workflow/status/3253801812-creator/desktop-pet/check.yml?label=check" alt="check"></a>
  <a href="https://github.com/3253801812-creator/desktop-pet/commits/main"><img src="https://img.shields.io/github/last-commit/3253801812-creator/desktop-pet?label=更新" alt="last commit"></a>
  <img src="https://img.shields.io/badge/platform-Windows%2010%20%2F%2011-0078D6?logo=windows&logoColor=white" alt="platform">
  <img src="https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white" alt="electron">
  <img src="https://img.shields.io/badge/Node-18%2B-339933?logo=nodedotjs&logoColor=white" alt="node">
  <a href="https://github.com/3253801812-creator/desktop-pet/stargazers"><img src="https://img.shields.io/github/stars/3253801812-creator/desktop-pet?style=social" alt="stars"></a>
</p>

一个住在 Windows 桌面上的小挂件。按住能拖，松手会自己贴到屏幕边缘；透明的地方不挡你点东西，只有它自己和右键菜单吃鼠标。可以按时间段安排每天要做的事，到点弹气泡，你不点确认它就每分钟再来问一次，右键里也能设 N 分钟后的闹钟。

<p align="center"><img src="docs/preview/settings-window.png" width="78%" alt="设置窗口"></p>

## 目录

- [功能](#功能) · [界面预览](#界面预览) · [快速开始](#快速开始)
- [怎么用](#怎么用) · [数据在哪](#数据在哪) · [自己改](#自己改)
- [项目结构](#项目结构) · [文档](#文档) · [贡献与许可](#贡献与许可)

## 功能

- 桌面挂件：透明窗口、置顶、不占任务栏；按住拖动，松手自动贴屏幕边缘
- 鼠标穿透：只有桌宠和右键菜单接收点击，其它地方点击直接落到桌面
- 时段任务：按「时间段 + 内容」排日程，到点弹气泡
- 提醒追认：不点确认就每分钟追一次，可选完成 / 稍后 / 忽略
- 闹钟：右键设 N 分钟后提醒，可附一句提醒内容，关掉程序再开还在
- 三个形象：斯卡蒂 / 小特 / 缪缪，连点十下切换
- 随机台词：没安排时点一下说一句，28 句按权重抽，不会连着重复
- 设置窗口：形象、大小、音量、音效、气泡、开机自启，改完立刻生效
- 托盘菜单：显示 / 隐藏桌宠、开关自启、退出
- 数据本地：四个 json 放在 `%APPDATA%\notepad-pet-app`，不联网、不上报
- 默认安静：不开机自启、日程为空，空着的时候点它有提示

## 界面预览

| 右键菜单（提醒 / 闹钟） | 设置窗口 |
|---|---|
| ![右键菜单](docs/preview/menu-0.5.14.png) | ![设置窗口](docs/preview/settings-window.png) |

气泡、台词、三个形象的更多截图见 [`docs/preview/`](docs/preview/)。


## 快速开始

| 方式 | 怎么做 | 说明 |
|---|---|---|
| **① 便携版（推荐）** | 到 Releases 下载 `记事本桌宠-便携版-*.exe` → 双击 | 单文件免安装；首次启动约 5–10 秒（要先自解包） |
| **② 安装版** | 下载 `记事本桌宠-安装程序-*.exe` → 一路下一步 | 会建开始菜单项，可在「应用和功能」里卸载 |
| **③ 从源码跑** | `npm install` → `npm start` | 需要 Node 18+；也可以双击项目里的 `桌宠.bat` |
| **④ 自己打包** | `npm install` → `npm run dist` | 产物在 `dist\` 下 |
| **⑤ 开机自动启动** | 想开再开：`设置 → 开机自动启动` 勾上 | **默认关着**；勾上后登录就自己出来，随时可以取消 |

**系统要求**：Windows 10 / 11（x64），无需安装 Node 或任何运行时。

程序是**单实例**：已经开着的时候再启动不会开第二个，只会把现有那个唤出来。

> **启动了却看不见桌宠？**「隐藏桌宠」是持久化开关，藏过之后下次启动也不显示。
> 0.5.10 起已改：**只要程序被启动，就一定把桌宠显示出来**，并发一条通知说明。
> 手工恢复：托盘图标右键 → 勾「显示桌宠」；或把 `%APPDATA%\notepad-pet-app\settings.json` 里 `petVisible` 改成 `true`。



## 怎么用

- 点一下：弹气泡显示「接下来」那件事，再点依次是今天清单、闹钟、收起
- 间隔 0.7 秒内快点几下：飘一句台词；连点十下换形象
- 右键：形象、提醒 / 闹钟、时段任务、设置、显示隐藏、退出
- 按住拖走，松手贴到最近的屏幕边缘
- 托盘图标右键：显示 / 隐藏桌宠、开关开机自启、退出

排日程、用闹钟的细节在 [docs/使用说明.md](docs/使用说明.md)。

## 数据在哪

`%APPDATA%\notepad-pet-app\` 下的四个文件：`settings.json`、`tasks.json`（另留一代 `.bak`）、`alarm.json`、`window.json`。

不联网、不上报；开机自启默认关着，勾上才会往注册表写一个值。换机器或备份，把这四个文件拷走就行。

## 自己改

需要 Node 18+：

```powershell
npm install
npm start            # 源码方式启动
npm run check        # 语法检查
npm test             # 完整验收：20 项综合 + 5 项闹钟跨重启（需要桌面环境）
npm run dist         # 打包出便携版和安装版，产物在 dist\
```

打包产物不进仓库，发版本走 Releases，细节见 [docs/发布流程.md](docs/发布流程.md)。

## 项目结构

```
main.js            主进程：窗口、托盘、鼠标穿透、任务调度、数据读写
preload.js         安全桥：只暴露白名单 IPC
renderer/          界面：pet.*（桌宠和右键菜单）、settings.*（设置窗口）
assets/            立绘、音效
tests/             回归验收（不参与打包）
tools/             开发调试脚本（不参与打包）
docs/              使用说明、常见问题、开发笔记、发布流程
build/icon.png     打包图标
```

## 文档

| 文件 | 内容 |
|---|---|
| [docs/使用说明.md](docs/使用说明.md) | 怎么用、台词池、时段任务与闹钟、设置窗口布局、数据位置 |
| [docs/常见问题.md](docs/常见问题.md) | 9 条常见疑问：启动慢、隐形、挡鼠标、自启、报毒等 |
| [docs/开发笔记.md](docs/开发笔记.md) | 源码结构、实测验收记录、已知限制、源码审核 |
| [docs/发布流程.md](docs/发布流程.md) | 打包命令、为什么 exe 不进仓库、怎么发 Release |
| [CHANGELOG.md](CHANGELOG.md) | 每个版本改了什么 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 想提 PR 看这个 |

## 贡献与许可

### 参与贡献

- 有 bug 或想法：开 Issue（写清版本号、Windows 版本、复现步骤）；
- 想改代码：Fork → 改 → 跑验收 → 提 PR；
- 提 PR 前请确认这两条是绿的：`npm run check`（语法）和 `npm test`（20 项综合验收 + 5 项闹钟跨重启）；
- 改 `.ps1` 时**必须保留 UTF-8 BOM**（PowerShell 5.1 没 BOM 会读成乱码），细节见 [发布流程](docs/发布流程.md)。

### 素材说明

角色立绘与音效素材来源于网络，**版权归原作者 / 发行方所有**；本项目仅供个人学习交流使用，如有侵权请联系删除。

### 许可

本仓库**未附开源许可证**（`UNLICENSED`）：代码与素材都包含第三方内容，不适合直接套用 MIT/GPL。
如需转载或发布衍生作品，请先自行确认素材与代码的授权情况。请勿用于商业用途。
