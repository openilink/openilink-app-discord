/**
 * 管理操作工具模块
 * 包含踢出成员和封禁成员等服务器管理功能
 */

import { Client } from "discord.js";

/* ------------------------------------------------------------------ */
/*  类型定义                                                            */
/* ------------------------------------------------------------------ */

interface ToolDefinition {
  name: string;
  description: string;
  command: string;
  parameters?: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface ToolContext {
  installationId: string;
  botId: string;
  userId: string;
  traceId: string;
  args: Record<string, any>;
}

type ToolHandler = (ctx: ToolContext) => Promise<string>;

interface ToolModule {
  definitions: ToolDefinition[];
  createHandlers: (client: Client) => Map<string, ToolHandler>;
}

/* ------------------------------------------------------------------ */
/*  工具定义                                                            */
/* ------------------------------------------------------------------ */

const definitions: ToolDefinition[] = [
  {
    name: "kick_member",
    description: "将指定成员从服务器中踢出",
    command: "kick_member",
    parameters: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "服务器 ID" },
        user_id: { type: "string", description: "要踢出的用户 ID" },
        reason: { type: "string", description: "踢出原因（可选）" },
      },
      required: ["guild_id", "user_id"],
    },
  },
  {
    name: "ban_member",
    description: "封禁指定成员，使其无法再进入服务器",
    command: "ban_member",
    parameters: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "服务器 ID" },
        user_id: { type: "string", description: "要封禁的用户 ID" },
        reason: { type: "string", description: "封禁原因（可选）" },
      },
      required: ["guild_id", "user_id"],
    },
  },
];

/* ------------------------------------------------------------------ */
/*  创建处理器                                                          */
/* ------------------------------------------------------------------ */

function createHandlers(client: Client): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 踢出成员
  handlers.set("kick_member", async (ctx) => {
    try {
      const { guild_id, user_id, reason } = ctx.args;
      const guild = await client.guilds.fetch(guild_id);
      const member = await guild.members.fetch(user_id);

      await member.kick(reason || undefined);

      const reasonStr = reason ? `，原因: ${reason}` : "";
      return `✅ 已将用户 ${member.displayName} (@${member.user.username}) 从服务器「${guild.name}」踢出${reasonStr}`;
    } catch (err: any) {
      return `❌ 踢出成员失败: ${err.message}`;
    }
  });

  // 封禁成员
  handlers.set("ban_member", async (ctx) => {
    try {
      const { guild_id, user_id, reason } = ctx.args;
      const guild = await client.guilds.fetch(guild_id);

      await guild.members.ban(user_id, {
        reason: reason || undefined,
      });

      // 尝试获取用户信息用于展示
      let userDisplay = user_id;
      try {
        const user = await client.users.fetch(user_id);
        userDisplay = `${user.displayName} (@${user.username})`;
      } catch {
        // 如果获取用户信息失败，使用 ID 即可
      }

      const reasonStr = reason ? `，原因: ${reason}` : "";
      return `✅ 已将用户 ${userDisplay} 从服务器「${guild.name}」封禁${reasonStr}`;
    } catch (err: any) {
      return `❌ 封禁成员失败: ${err.message}`;
    }
  });

  return handlers;
}

/* ------------------------------------------------------------------ */
/*  导出模块                                                            */
/* ------------------------------------------------------------------ */

export const moderationTools: ToolModule = {
  definitions,
  createHandlers,
};
