/**
 * Discord Tools 注册中心
 * 汇总所有工具模块，对外提供统一的 collectAllTools 方法
 */

import { Client } from "discord.js";
import type { ToolDefinition, ToolHandler } from "../hub/types.js";
import { messagingTools } from "./messaging.js";
import { channelTools } from "./channels.js";
import { memberTools } from "./members.js";
import { embedTools } from "./embed.js";
import { fileTools } from "./files.js";
import { moderationTools } from "./moderation.js";

/* ------------------------------------------------------------------ */
/*  类型定义                                                            */
/* ------------------------------------------------------------------ */

export interface ToolModule {
  definitions: ToolDefinition[];
  createHandlers: (client: Client) => Map<string, ToolHandler>;
}

/* ------------------------------------------------------------------ */
/*  所有工具模块列表                                                     */
/* ------------------------------------------------------------------ */

const allModules: ToolModule[] = [
  messagingTools,
  channelTools,
  memberTools,
  embedTools,
  fileTools,
  moderationTools,
];

/* ------------------------------------------------------------------ */
/*  汇总所有工具定义和处理器                                               */
/* ------------------------------------------------------------------ */

/**
 * 收集全部工具的定义与处理器
 * @param client - Discord.js Client 实例
 * @returns 包含所有工具定义和对应处理器映射的对象
 */
export function collectAllTools(client: Client): {
  definitions: ToolDefinition[];
  handlers: Map<string, ToolHandler>;
} {
  const definitions: ToolDefinition[] = [];
  const handlers = new Map<string, ToolHandler>();

  for (const mod of allModules) {
    // 收集定义
    definitions.push(...mod.definitions);

    // 收集处理器
    const moduleHandlers = mod.createHandlers(client);
    for (const [name, handler] of moduleHandlers) {
      handlers.set(name, handler);
    }
  }

  return { definitions, handlers };
}

/* ------------------------------------------------------------------ */
/*  重新导出子模块，方便外部按需引用                                        */
/* ------------------------------------------------------------------ */

export { messagingTools } from "./messaging.js";
export { channelTools } from "./channels.js";
export { memberTools } from "./members.js";
export { embedTools } from "./embed.js";
export { fileTools } from "./files.js";
export { moderationTools } from "./moderation.js";
