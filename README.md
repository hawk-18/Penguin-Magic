

# 🐧 企鹅工坊 Penguin Magic

### AI 图像 / 视频创作与桌面管理工具

**对话即创作，生成即管理 —— 让灵感井井有条**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)](https://typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss)](https://tailwindcss.com)
[![Electron](https://img.shields.io/badge/Electron-39-47848F?logo=electron)](https://electronjs.org)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite)](https://vite.dev)

</div>

---

## 🌟 这是什么

企鹅工坊是一个集 **AI 对话、图像生成、视频生成、作品管理** 于一体的创意工作台。

传统 AI 生图工具的痛点——图片散落各处、没有管理、无法整理对比——在这里被一并解决：你既能像聊天一样让 AI 帮你写文案、生图、出视频，又能像整理桌面一样把所有作品拖拽、分组、叠放，全程本地优先、数据自己掌控。

> 🎯 **对话即创作，生成即管理** —— 不只是生成内容，更是一个可视化的创意工作台。

---

## ✨ 核心特性

### 💬 AI 对话工作台（Chat）
一个对话窗口搞定多种创作需求，自由切换技能：

| 技能 | 能力 |
|------|------|
| 🖼️ 图像 | 在对话里直接描述并生成图片 |
| 🎬 视频 | 文生视频 / 图生视频，结果直接回贴到对话 |
| ✍️ 写作 | 文案、脚本、长文创作 |
| 🌐 翻译 | 中英互译，支持简体 / 繁体 |
| 💻 代码 | 写代码、解释代码 |
| 📊 分析 | 内容分析与总结 |
| 📑 PPT | 结构化大纲与演示文稿草稿 |

支持**多会话管理**（新建 / 重命名 / 删除会话，历史自动保存）、附件上传，对话记录本地持久化。

### 🎬 视频生成
把视频创作直接接进工作流，支持两大模型族：

- **Google Veo 3.1** —— 文生视频、图生视频、首尾帧控制、多图参考（1–3 张），支持 `16:9` / `9:16`
- **Sora 2 / Sora 2 Pro** —— 10s / 15s / 25s 多时长，高清输出
- 异步任务带进度查询，生成完成自动入库管理

### 🖼️ AI 图像生成
- 基于 Gemini 图像能力，支持第三方中转接入
- 一键应用创意库提示词，小白也能出大片
- 云端工作流生图（RunningHub），复杂效果开箱即用

### 🗂️ 桌面级作品管理
像整理桌面一样管理你的 AI 作品：

- **自然拖放** —— 从电脑直接拖图片 / 文件夹进工作台，拖拽调整位置，所见即所得
- **文件夹 & 智能叠放** —— 按项目归类，同系列作品自动聚合，节省空间
- **多选批量操作** —— 批量整理，效率倍增
- **创意库系统** —— 内置多种创意模板，支持智能导入（输入编号一键拉取）

### 🔄 完整创作闭环
对话 / 生成 → 预览 → 再编辑 → 重新生成 → 管理保存，全流程无缝衔接。

---

## 🎨 设计理念

```
轻量 · 直觉 · 高效
```

- **轻设计** —— 克制的视觉，让作品成为主角
- **零学习成本** —— 熟悉的桌面交互，上手即用
- **本地优先** —— 数据存在本地，快速又安全

---

## 🚀 快速开始

### 方式一：一键启动（Windows，推荐）

```text
1. 首次使用，双击运行  Install.bat   （安装依赖）
2. 以后每次启动，双击  Start.bat
3. 浏览器自动打开      http://127.0.0.1:8765
```

> 💡 每次更新代码后，重新执行一遍 `Install.bat` 再 `Start.bat`。
> 需要重启 / 停止服务可用 `Restart.bat` / `Stop.bat`。

### macOS

```bash
# 双击或在终端运行
./start-mac.command
```

### 方式二：手动启动（全平台）

```bash
# 1. 安装前端依赖
npm install

# 2. 安装后端依赖
cd backend-nodejs && npm install && cd ..

# 3. 构建前端
npm run build

# 4. 启动后端服务
cd backend-nodejs && node src/server.js

# 5. 打开浏览器
#    http://127.0.0.1:8765
```

### 桌面客户端（Electron）

```bash
# 开发模式（前端 + 后端 + Electron 一起起）
npm run electron:dev

# 打包 Windows 安装包
npm run package
```

### 环境要求

- Node.js 18 或更高版本
- Windows 10/11 一键脚本开箱即用；macOS / Linux 走手动启动或 `start-mac.command`

---

## ⚙️ 配置 API Key

首次使用需在应用内 **设置** 里填写各能力对应的 API Key 与中转地址：

- **图像**：Gemini API（或第三方中转）
- **视频**：Veo 3.1、Sora 2 对应的服务密钥
- **对话**：聊天模型密钥

所有密钥仅保存在本地，不上传。

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 19 + TypeScript 5.8 |
| 样式方案 | Tailwind CSS 4 |
| 构建工具 | Vite 6 |
| 桌面封装 | Electron 39（electron-builder 打包） |
| 后端服务 | Node.js |
| 图像生成 | Gemini（`@google/genai`）/ 第三方中转 / RunningHub 工作流 |
| 视频生成 | Google Veo 3.1 / Sora 2 · Sora 2 Pro |

---

## 📁 目录结构

```
Penguin-Magic/
├── components/
│   ├── Chat/            # 💬 AI 对话工作台（ChatPage）
│   ├── Canvas/          # 画布与桌面交互
│   ├── CreativeLibrary  # 创意库
│   ├── RunningHub*      # 云端工作流生图
│   └── ...
├── services/
│   ├── geminiService.ts # 图像生成
│   ├── veoService.ts    # 🎬 Veo 3.1 视频生成
│   ├── soraService.ts   # 🎬 Sora 视频生成
│   └── api/             # 后端接口封装
├── backend-nodejs/      # Node.js 后端服务
├── electron/            # Electron 主进程
├── hooks/ contexts/     # 状态与交互逻辑
└── *.bat / start-mac.command  # 一键启动脚本
```

---

## 📦 安装与构建

```bash
git clone https://github.com/hawk-18/Penguin-Magic.git
cd Penguin-Magic
npm install
```

详细更新记录见 [CHANGELOG.md](./CHANGELOG.md)。

---

## 💬 反馈与支持

遇到问题或有功能建议，欢迎到 [GitHub Issues](https://github.com/hawk-18/Penguin-Magic/issues) 提交。

---

<div align="center">

**企鹅工坊** —— 让 AI 创作不再凌乱

</div>
