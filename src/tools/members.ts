/**
 * 成员与服务器相关工具模块
 * 包含获取用户信息、列出成员、获取服务器信息、列出角色等操作
 */

import { Client, GuildMember } from "discord.js";

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
    name: "get_user_info",
    description: "获取指定 Discord 用户的信息",
    command: "get_user_info",
    parameters: {
      type: "object",
      properties: {
        user_id: { type: "string", description: "用户 ID" },
      },
      required: ["user_id"],
    },
  },
  {
    name: "list_members",
    description: "列出指定服务器的成员列表",
    command: "list_members",
    parameters: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "服务器 ID" },
        count: { type: "number", description: "获取数量，默认 50" },
      },
      required: ["guild_id"],
    },
  },
  {
    name: "get_server_info",
    description: "获取指定 Discord 服务器的详细信息",
    command: "get_server_info",
    parameters: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "服务器 ID" },
      },
      required: ["guild_id"],
    },
  },
  {
    name: "list_roles",
    description: "列出指定服务器的所有角色",
    command: "list_roles",
    parameters: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "服务器 ID" },
      },
      required: ["guild_id"],
    },
  },
];

/* ------------------------------------------------------------------ */
/*  创建处理器                                                          */
/* ------------------------------------------------------------------ */

function createHandlers(client: Client): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 获取用户信息
  handlers.set("get_user_info", async (ctx) => {
    try {
      const { user_id } = ctx.args;
      const user = await client.users.fetch(user_id);

      const info = [
        `👤 用户信息:`,
        `  用户名: ${user.username}`,
        `  显示名: ${user.displayName}`,
        `  ID: ${user.id}`,
        `  是否机器人: ${user.bot ? "是" : "否"}`,
        `  账号创建时间: ${user.createdAt.toLocaleString("zh-CN")}`,
        `  头像链接: ${user.avatarURL() || "无自定义头像"}`,
      ];

      return info.join("\n");
    } catch (err: any) {
      return `❌ 获取用户信息失败: ${err.message}`;
    }
  });

  // 列出服务器成员
  handlers.set("list_members", async (ctx) => {
    try {
      const { guild_id, count } = ctx.args;
      const limit = count ?? 50;
      const guild = await client.guilds.fetch(guild_id);
      const members = await guild.members.fetch({ limit });

      const lines = members.map((m: GuildMember) => {
        const roles = m.roles.cache
          .filter((r) => r.name !== "@everyone")
          .map((r) => r.name)
          .join(", ");
        const roleStr = roles ? ` [${roles}]` : "";
        return `  - ${m.displayName} (@${m.user.username})${roleStr}`;
      });

      return `👥 服务器「${guild.name}」成员列表（共 ${lines.length} 人）:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `❌ 获取成员列表失败: ${err.message}`;
    }
  });

  // 获取服务器信息
  handlers.set("get_server_info", async (ctx) => {
    try {
      const { guild_id } = ctx.args;
      const guild = await client.guilds.fetch(guild_id);

      // 获取完整的服务器数据（包含成员数等）
      const fullGuild = await guild.fetch();

      const info = [
        `🏠 服务器信息:`,
        `  名称: ${fullGuild.name}`,
        `  ID: ${fullGuild.id}`,
        `  拥有者 ID: ${fullGuild.ownerId}`,
        `  成员数量: ${fullGuild.memberCount}`,
        `  创建时间: ${fullGuild.createdAt.toLocaleString("zh-CN")}`,
        `  描述: ${fullGuild.description || "无"}`,
        `  验证等级: ${fullGuild.verificationLevel}`,
        `  图标链接: ${fullGuild.iconURL() || "无"}`,
      ];

      return info.join("\n");
    } catch (err: any) {
      return `❌ 获取服务器信息失败: ${err.message}`;
    }
  });

  // 列出服务器角色
  handlers.set("list_roles", async (ctx) => {
    try {
      const { guild_id } = ctx.args;
      const guild = await client.guilds.fetch(guild_id);

      // 需要获取完整 guild 以访问角色缓存
      const fullGuild = await guild.fetch();
      const roles = await fullGuild.roles.fetch();

      const lines = roles
        .sort((a, b) => b.position - a.position)
        .map((r) => {
          const color = r.hexColor !== "#000000" ? ` 颜色:${r.hexColor}` : "";
          const memberCount = r.members.size;
          return `  - ${r.name} (ID: ${r.id}, 成员数: ${memberCount}${color})`;
        });

      return `🎭 服务器「${fullGuild.name}」角色列表（共 ${lines.length} 个）:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `❌ 获取角色列表失败: ${err.message}`;
    }
  });

  return handlers;
}

/* ------------------------------------------------------------------ */
/*  导出模块                                                            */
/* ------------------------------------------------------------------ */

export const memberTools: ToolModule = {
  definitions,
  createHandlers,
};
