/**
 * App Manifest — 声明应用能力
 */

import type { Config } from "../config.js";
import type { ToolDefinition } from "./types.js";

/** Manifest 结构 */
export interface AppManifest {
  slug: string;
  name: string;
  icon: string;
  description: string;
  events: string[];
  scopes: string[];
  webhook_url: string;
  oauth: {
    setup_url: string;
    redirect_url: string;
  };
  tools?: ToolDefinition[];
  /** Hub 应用市场一键安装时自动生成配置表单的 JSON Schema */
  config_schema?: Record<string, unknown>;
  /** 安装指南，Markdown 格式 */
  guide?: string;
}

/**
 * 生成 App Manifest
 * @param config - 应用配置
 * @param toolDefinitions - 可选的工具定义列表
 */
export function getManifest(
  config: Config,
  toolDefinitions?: ToolDefinition[],
): AppManifest {
  const manifest: AppManifest = {
    slug: "discord-bridge",
    name: "Discord Bridge",
    icon: "🎮",
    description: "微信 ↔ Discord 双向消息桥接",
    events: ["message", "command"],
    scopes: ["message:read", "message:write", "tools:write"],
    webhook_url: `${config.baseUrl}/hub/webhook`,
    oauth: {
      setup_url: `${config.baseUrl}/oauth/setup`,
      redirect_url: `${config.baseUrl}/oauth/redirect`,
    },
  };

  if (toolDefinitions && toolDefinitions.length > 0) {
    manifest.tools = toolDefinitions;
  }

  manifest.config_schema = {
    type: "object",
    properties: {
      discord_bot_token: {
        type: "string",
        title: "Discord Bot Token",
        description: "在 Developer Portal 创建 Bot 后获取",
      },
      discord_channel_id: {
        type: "string",
        title: "Discord 频道 ID",
        description: "默认转发到的频道（可选）",
      },
    },
    required: ["discord_bot_token"],
  };

  manifest.guide = `## Discord Bridge 安装指南
### 第 1 步：创建 Discord 应用
1. 访问 [discord.com/developers](https://discord.com/developers/applications)
2. New Application → Bot → Reset Token → 复制
### 第 2 步：启用 Intents
Bot → Privileged Gateway Intents → 开启 Message Content Intent
### 第 3 步：邀请到服务器
OAuth2 → URL Generator → Scopes: bot → Permissions: Send Messages, Read Message History → 用 URL 邀请
### 第 4 步：获取频道 ID
Discord 开发者模式 → 右键频道 → 复制 ID
### 第 5 步：填写上方配置并安装
`;

  return manifest;
}
