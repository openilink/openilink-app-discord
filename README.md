# @openilink/app-discord

[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Discord.js](https://img.shields.io/badge/discord.js-v14-5865F2)](https://discord.js.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

OpeniLink Hub App -- 微信与 Discord 双向消息桥接 + 19 个 AI Tools。

## 简介

`@openilink/app-discord` 是一个 OpeniLink Hub 应用，提供以下核心能力：

- **IM 桥接**：微信消息自动转发到 Discord 频道（Embed 格式），Discord 回复自动转发回微信
- **自然语言操作**：通过 19 个 AI Tools，让 AI 助手用自然语言操控 Discord（发消息、管理频道、查成员等）
- **Gateway 连接**：通过 Discord Gateway WebSocket 接收消息，无需公网暴露 Bot

## 功能特性

### IM 桥接
- 微信文本/图片/语音/视频/文件消息 -> Discord Embed
- Discord 回复消息 -> 微信（通过消息引用自动匹配目标用户）
- 消息映射关系持久化（SQLite）

### 19 个 AI Tools
通过 OpeniLink Hub 的工具协议，AI 助手可以用自然语言执行 Discord 操作：

| 模块 | 工具 | 说明 |
|------|------|------|
| Messaging | `send_discord_message` | 发送文本消息 |
| | `reply_discord_message` | 回复指定消息 |
| | `edit_discord_message` | 编辑 Bot 消息 |
| | `delete_discord_message` | 删除消息 |
| | `get_message_history` | 获取消息历史 |
| | `add_reaction` | 添加表情反应 |
| Channels | `list_channels` | 列出服务器频道 |
| | `get_channel_info` | 获取频道详情 |
| | `create_channel` | 创建新频道 |
| | `create_thread` | 创建线程 |
| | `pin_message` | 固定消息 |
| Members | `get_user_info` | 获取用户信息 |
| | `list_members` | 列出服务器成员 |
| | `get_server_info` | 获取服务器信息 |
| | `list_roles` | 列出服务器角色 |
| Embed | `send_embed` | 发送 Embed 富文本消息 |
| Files | `upload_file` | 上传文件（受限提示） |
| Moderation | `kick_member` | 踢出成员 |
| | `ban_member` | 封禁成员 |

### Gateway 无需公网
Discord Bot 通过 WebSocket Gateway 连接，只需出站网络即可接收消息，无需为 Bot 配置公网入口。

## 架构

```mermaid
graph LR
    WX[微信用户] -->|消息| HUB[OpeniLink Hub]
    HUB -->|Webhook POST| APP[Discord Bridge App]
    APP -->|Gateway WebSocket| DC[Discord]
    DC -->|消息事件| APP
    APP -->|Hub API| HUB
    HUB -->|消息| WX

    subgraph Discord Bridge App
        direction TB
        WEB[HTTP Server]
        WTD[WxToDiscord Bridge]
        DTW[DiscordToWx Bridge]
        RT[Router]
        TL[19 AI Tools]
        ST[(SQLite)]
    end
```

**消息流转**：

1. **自动桥接（微信 -> Discord）**：Hub Webhook -> handleWebhook -> WxToDiscord -> Discord Embed
2. **自动桥接（Discord -> 微信）**：Discord Gateway -> registerMessageHandler -> DiscordToWx -> Hub API -> 微信
3. **自然语言命令**：Hub Webhook (command) -> Router -> Tool Handler -> Discord API -> 结果回复到微信
4. **AI 工具调用**：Hub 将 AI 选择的工具通过 command 事件发送，Router 分发到对应 handler 执行

## 快速开始

### 1. 创建 Discord Application

1. 访问 [Discord Developer Portal](https://discord.com/developers/applications)
2. 点击 **New Application**，填写应用名称
3. 进入 **Bot** 页面，点击 **Reset Token** 获取 Bot Token（妥善保管）

### 2. 启用 Gateway Intents

在 Bot 页面，启用以下 Privileged Gateway Intents：

- **SERVER MEMBERS INTENT** -- 获取成员列表
- **MESSAGE CONTENT INTENT** -- 读取消息内容

### 3. 邀请 Bot 到服务器

1. 进入 **OAuth2 > URL Generator**
2. 选择 Scopes: `bot`
3. 选择 Bot Permissions: `Send Messages`, `Read Message History`, `Manage Messages`, `Embed Links`, `Attach Files`, `Add Reactions`, `Manage Channels`, `Kick Members`, `Ban Members`
4. 复制生成的 URL，在浏览器中打开，选择目标服务器

### 4. 获取频道 ID

1. 在 Discord 中，进入 **用户设置 > 高级 > 开发者模式** 开启
2. 右键目标频道，选择 **复制频道 ID**

### 5. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填入以下配置
```

### 6. 启动

**使用 Docker Compose（推荐）**：

```bash
docker compose up -d
```

**本地开发**：

```bash
npm install
npm run dev
```

**编译运行**：

```bash
npm run build
npm start
```

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `HUB_URL` | 是 | - | OpeniLink Hub 地址 |
| `BASE_URL` | 是 | - | 本应用公网地址（用于 OAuth 回调和 Webhook） |
| `DISCORD_BOT_TOKEN` | 是 | - | Discord Bot Token |
| `DISCORD_CHANNEL_ID` | 是 | - | 默认消息转发频道 ID |
| `DB_PATH` | 否 | `data/discord.db` | SQLite 数据库路径 |
| `PORT` | 否 | `8083` | HTTP 服务端口 |

## Discord Bot 创建配置指南

### 详细步骤

1. **创建应用**
   - 登录 [Discord Developer Portal](https://discord.com/developers/applications)
   - 点击右上角 **New Application**
   - 输入应用名称（如 "OpeniLink Bridge"），点击 Create

2. **获取 Bot Token**
   - 左侧菜单选择 **Bot**
   - 点击 **Reset Token**，复制并保存 Token
   - 注意：Token 只会显示一次，请妥善保存

3. **配置 Intents**
   - 在 Bot 页面下方找到 **Privileged Gateway Intents**
   - 开启 `SERVER MEMBERS INTENT`
   - 开启 `MESSAGE CONTENT INTENT`
   - 点击 **Save Changes**

4. **生成邀请链接**
   - 左侧菜单选择 **OAuth2 > URL Generator**
   - Scopes 勾选: `bot`
   - Bot Permissions 勾选:
     - `Send Messages`
     - `Read Message History`
     - `Manage Messages`
     - `Embed Links`
     - `Attach Files`
     - `Add Reactions`
     - `Manage Channels`
     - `Kick Members`
     - `Ban Members`
   - 复制底部生成的 URL

5. **邀请到服务器**
   - 在浏览器中打开复制的 URL
   - 选择目标服务器，确认授权

6. **获取频道 ID**
   - 在 Discord 客户端中开启开发者模式（设置 > 高级 > 开发者模式）
   - 右键点击目标频道，选择「复制频道 ID」

## 开发指南

### 安装依赖

```bash
npm install
```

### 运行测试

```bash
npm test
```

### 监视模式

```bash
npm run test:watch
```

### 项目结构

```
src/
  index.ts              # 主入口
  config.ts             # 环境变量配置
  store.ts              # SQLite 存储层
  router.ts             # 命令路由器
  hub/
    types.ts            # Hub 协议类型定义
    oauth.ts            # OAuth2 + PKCE 安装流程
    webhook.ts          # Webhook 签名验证与事件分发
    client.ts           # Hub Bot API 客户端
    manifest.ts         # App Manifest 声明
  discord/
    client.ts           # Discord SDK 封装
    event.ts            # Discord 消息事件监听
  bridge/
    wx-to-discord.ts    # 微信 -> Discord 消息转发
    discord-to-wx.ts    # Discord -> 微信消息转发
  tools/
    index.ts            # 工具聚合注册
    messaging.ts        # 消息操作工具（6 个）
    channels.ts         # 频道操作工具（5 个）
    members.ts          # 成员操作工具（4 个）
    embed.ts            # Embed 富文本工具（1 个）
    files.ts            # 文件上传工具（1 个）
    moderation.ts       # 管理操作工具（2 个）
  utils/
    crypto.ts           # 签名验证与 PKCE
tests/
  config.test.ts
  store.test.ts
  router.test.ts
  utils/
    crypto.test.ts
  hub/
    webhook.test.ts
    client.test.ts
    manifest.test.ts
  bridge/
    wx-to-discord.test.ts
    discord-to-wx.test.ts
  tools/
    messaging.test.ts
    channels.test.ts
    members.test.ts
```

## 安全与隐私

### 数据处理说明

- **消息内容不落盘**：本 App 在转发消息时，消息内容仅在内存中中转，**不会存储到数据库或磁盘**
- **仅保存消息 ID 映射**：数据库中只保存消息 ID 的对应关系（用于回复路由），不保存消息正文
- **用户数据严格隔离**：所有数据库查询均按 `installation_id` + `user_id` 双重过滤，不同用户之间完全隔离，无法互相访问

### 应用市场安装（托管模式）

通过 OpeniLink Hub 应用市场一键安装时，消息将通过我们的服务器中转。我们承诺：

- 不会记录、存储或分析用户的消息内容
- 不会将用户数据用于任何第三方用途
- 所有 App 代码完全开源，接受社区审查
- 我们会对每个上架的 App 进行严格的安全审查

### 自部署（推荐注重隐私的用户）

如果您对数据隐私有更高要求，建议自行部署本 App：

```bash
# Docker 部署
docker compose up -d

# 或源码运行
npm install && npm run build && npm start
```

自部署后所有数据仅在您自己的服务器上流转，不经过任何第三方。

## License

[MIT](LICENSE)
