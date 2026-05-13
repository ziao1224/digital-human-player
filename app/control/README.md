# AI 数字人演讲系统 — 播放版

## 系统简介

在无 GPU 的电脑上播放预生成的数字人演讲视频，支持语音问答。

- 演讲播放：PPT 图片 + 数字人视频自动翻页
- 语音问答：基于 PPT 内容 + 本地知识库的智能对话
- 无需 GPU、Python、LibreOffice，只需 Node.js

## 迁移教程

### 第一步：在 GPU 机器上准备数据

1. 上传 PPT → 点击「生成演讲稿」→ 点击「生成视频」
2. 确认 `app/server/video-cache/{hash}/` 下有 `scripts.json` + `video/*.mp4`
3. 确认 `app/server/images/` 下有 PPT 转换的图片

### 第二步：拷贝到无 GPU 机器

**代码（通过 Git）：**
```bash
git clone https://github.com/ziao1224/digital-human-player.git
```

**数据文件（一次性 U 盘拷贝）：**
```
GPU 机器                           →  无 GPU 机器
app/server/video-cache/            →  同位置
app/server/images/                 →  同位置
app/.env                           →  同位置
```

### 第三步：在无 GPU 机器上启动

```bash
cd digital-human-player/app
npm install
cd server && npm install && cd ..
```

双击 `control/start.bat`，浏览器打开 `http://localhost:5173/player`

**之后每次使用只需双击 `control/start.bat`**

### 控制脚本

| 脚本 | 位置 | 功能 |
|------|------|------|
| `start.bat` | `control/` | 启动后端 + 前端（自动装依赖） |
| `stop.bat` | `control/` | 关闭所有服务 |
| `restart.bat` | `control/` | 重启 |
| `status.bat` | `control/` | 查看服务状态 |

### 更新代码

当 GPU 机器上的代码有新版本时：
```bash
cd digital-human-player
git pull
```
无需重新拷贝数据文件。

---

## 迁移问题汇总

| # | 问题 | 原因 | 解决方案 |
|---|------|------|----------|
| 1 | `vite` 找不到 | `node_modules` 未安装 | `npm install` |
| 2 | `require('./rtc-voice-chat')` 报错 | 漏拷依赖文件 | 补 `rtc-voice-chat.js`、`volcengine-sign.js`、`rtc-token.js` |
| 3 | 缓存显示 "Untitled" | `index.json` 标题未从数据更新 | `saveScripts` 时从第一页标题提取 |
| 4 | 上传新 PPT 后刷新/切换变回旧 PPT | `saveMeta` 没 `await`，IndexedDB 写入竞态 | 所有 `saveMeta` 加 `await` |
| 5 | 新 PPT 的 slides 刷新后丢失 | 上传时未调用 `saveMeta` 持久化 | 上传即写入 IndexedDB |
| 6 | 不同 PPT 数据乱串 | `loadLatestMeta` 靠时间戳选 PPT | 引入 `active_ppt_hash` 锁定当前 PPT |
| 7 | 视频显示"待生成"但文件存在 | `useBatchAvatar` 只查 IndexedDB 不看磁盘 | 增加后端 `/api/ppt-cache/{hash}/status` 查询 |
| 8 | 磁盘视频清不掉 | 旧缓存同时存在磁盘 + IndexedDB | `clearVideos` 同时清两端 |
| 9 | 知识库 15000 字变 1312 字 | IndexedDB 空值覆盖文件加载内容 | `setVoiceKnowledge` 只在有非空值时才写入 |
| 10 | 知识库被意外修改 | textarea 始终可编辑 | 默认只读 + 编辑锁 + 取消恢复 |
| 11 | 迁移后图片不显示 | 图片 URL 指向旧 UUID | 复用缓存时验证磁盘文件存在性 |
| 12 | PPT 缓存列表找不到旧视频 | 正则不匹配 `-` 开头的 hash | 正则改为 `[-a-f0-9]+` |

---

## 功能说明

### 后台管理页 (`/admin`)

| 功能 | 说明 |
|------|------|
| 上传 PPT | 仅支持 `.pptx` 格式 |
| 生成演讲稿 | DeepSeek AI 自动撰写 |
| 导入/导出演讲稿 | `.txt` 格式，可跨机器迁移 |
| 生成视频 | 在有 GPU 的机器上运行（本机需 SadTalker） |
| 语音问答 | 知识问答模式（DeepSeek + 浏览器 ASR + 火山 TTS） |
| PPT 缓存管理 | 切换/删除已生成的 PPT |
| 知识库编辑 | 默认只读，点「编辑」修改，取消可恢复 |

### 播放页面 (`/player`)

- 左侧数字人视频，右侧 PPT 内容
- 支持自动播放和手动翻页
- 右下角语音问答悬浮球

### 语音问答

两种模式（当前仅启用知识问答）：

| 模式 | 引擎 | 适用场景 |
|------|------|----------|
| 知识问答 | DeepSeek + 浏览器 ASR + 火山 TTS | 基于 PPT + 知识库的精准问答 |
| 实时对话 | Volcano 端到端模型 | 快速闲聊（已停用，代码保留） |

知识问答流程：你说话 → 浏览器识别成文字 → DeepSeek（带全 PPT 上下文）→ 火山 TTS 播报

### 知识库

- 默认文件：`public/knowledge/default.md`
- 自动加载到语音问答上下文
- 修改该文件即可更新知识库内容

---

## 环境要求

| 项目 | GPU 机器（生成） | 无 GPU 机器（播放） |
|------|-----------------|---------------------|
| Node.js 18+ | ✓ | ✓ |
| Python 3.10+ | ✓ | ✗ |
| SadTalker | ✓ | ✗ |
| LibreOffice | ✓ | ✗ |
| GPU | ✓ | ✗ |
| DeepSeek API Key | ✓ | ✓ |
| 火山引擎 API Key | ✓ | ✓ |
