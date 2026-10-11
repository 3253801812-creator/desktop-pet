# 记事本桌宠 · 工具说明

这个目录是**开发/调试用的脚本**，不参与打包（`package.json` 的 `build.files` 只收 `main.js`、`preload.js`、`renderer/`、`assets/`）。

## tools/ 根目录（日常会用到的）

| 脚本 | 干什么 | 用法 |
|---|---|---|
| `uishot.mjs` | 给窗口截图并用字符画把画面打出来（本机没有图像识别，靠这个"看"界面） | `node tools/uishot.mjs [端口] [目标页]` |
| `shotdiff.mjs` | 用 CDP 隔一段时间截两次屏，判断画面**是不是真的在变**（验证动画/自愈） | `node tools/shotdiff.mjs [间隔ms] [端口]` |
| `pluginlines.mjs` | 从参考插件 `D:\dsh大肥鱼插件` 里抽出全部"随机语句"台词，并标出桌宠已经装了哪些 | `node tools/pluginlines.mjs <插件目录> [桌宠目录]` |
| `asar-list.mjs` | 读出打包版 `app.asar` 里的文件清单，核对"包里到底装了什么"（有没有混进测试/文档） | `node tools/asar-list.mjs <app.asar>` |

## tools/art/（立绘抠图相关，一次性但可复用）

| 脚本 | 干什么 |
|---|---|
| `cutout.mjs` | 抠图主流程：白底/洋红底两张原图求差值，生成带透明通道的 PNG |
| `analyze.mjs` | 分析两张原图的尺寸、边框底色一致性，评估能不能抠 |
| `checkcut.mjs` | 抠图体检：半透明像素是正常抗锯齿带，还是白边光晕 |
| `leakmap.mjs` | 抠图泄漏体检（按真实坐标对齐原图与结果）；抠图参数读 `assets/立绘来源.json` |
| `inspect-region.mjs` | 细看指定区域（比如白头发和白底之间有没有可分辨的边界） |
| `ascii.mjs` | 把图片转字符画，纯文本环境下判断主体轮廓 |
| `colormap.mjs` | 彩色字符图：打印区域平均 RGB，判断"被吃掉的那块"到底是什么 |
| `framescan.mjs` | 看一帧 PNG 的外形（每行不透明范围）与颜色 |
| `gifframes.mjs` | 用 Chromium 的 ImageDecoder 把 GIF 拆成 PNG 帧 |
| `framediff.mjs` | 比较同一 GIF 各帧之间是否真有差别（判断是不是"假动画"） |
| `gifinfo.mjs` | 轻量 GIF 结构扫描：尺寸、帧数、是否声明透明色、每帧延时、调色板大小 |

> 立绘是怎么来的、踩过什么坑，看 `README.md` 第四节「立绘是怎么来的（抠图）」。

## 自动化验收

回归测试**不在这里**，在 `tests/`：`tests/run-all.ps1` 一把跑完。见 `tests/README.md`。