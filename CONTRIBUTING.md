# 贡献指南

感谢愿意帮忙！项目不大，规矩也简单。

## 先跑起来

```powershell
git clone https://github.com/3253801812-creator/desktop-pet.git
cd desktop-pet
npm install
npm start          # 源码方式启动桌宠
```

## 提 PR 之前

| 命令 | 作用 |
|---|---|
| `npm run check` | 四个 JS 文件的语法检查 |
| `npm test` | 完整验收：20 项综合 + 5 项闹钟跨重启（**需要桌面环境**，会临时结束正在运行的桌宠） |
| `npm run test:smoke` | 针对已打包 exe 的 7 项冒烟 |

两条都绿了再提 PR。测试全部用隔离数据目录（`%TEMP%\np-*-profile`），**不会碰你的真实数据**，也不会动你的开机自启项。

## 几条硬规矩

1. **不删功能**。要重构就保持行为等价，并在 PR 里说明。
2. **`.ps1` 必须带 UTF-8 BOM** —— Windows PowerShell 5.1 没 BOM 会把中文读成乱码。
3. **右键菜单改动要过排版检查** —— 标签换行 / 文字被裁切会被 `tests/payloads/menu-layout.js` 拦下。
4. **别让测试碰真实数据** —— 用 `NOTEPAD_PET_USERDATA` 指向临时目录，用 `NOTEPAD_PET_NO_AUTOSTART=1` 避免改注册表。

## 提交信息

`版本号：一句话说明`，例如 `0.5.14：右键菜单「提醒 / 闹钟」改为整行卡片`。

## 发布

见 [docs/发布流程.md](docs/发布流程.md)。
