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

  return manifest;
}
