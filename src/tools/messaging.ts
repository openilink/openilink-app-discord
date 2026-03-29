/**
 * 消息相关工具模块
 * 包含发送、回复、编辑、删除消息以及查看消息历史和添加表情等操作
 */

import { Client, TextChannel } from "discord.js";

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
    name: "send_discord_message",
    description: "向指定 Discord 频道发送一条文本消息",
    command: "send_discord_message",
    parameters: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "目标频道 ID" },
        text: { type: "string", description: "消息内容" },
      },
      required: ["channel_id", "text"],
    },
  },
  {
    name: "reply_discord_message",
    description: "回复指定频道中的某条消息",
    command: "reply_discord_message",
    parameters: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "频道 ID" },
        message_id: { type: "string", description: "要回复的消息 ID" },
        text: { type: "string", description: "回复内容" },
      },
      required: ["channel_id", "message_id", "text"],
    },
  },
  {
    name: "edit_discord_message",
    description: "编辑指定频道中由 Bot 发送的消息",
    command: "edit_discord_message",
    parameters: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "频道 ID" },
        message_id: { type: "string", description: "要编辑的消息 ID" },
        text: { type: "string", description: "新的消息内容" },
      },
      required: ["channel_id", "message_id", "text"],
    },
  },
  {
    name: "delete_discord_message",
    description: "删除指定频道中的某条消息",
    command: "delete_discord_message",
    parameters: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "频道 ID" },
        message_id: { type: "string", description: "要删除的消息 ID" },
      },
      required: ["channel_id", "message_id"],
    },
  },
  {
    name: "get_message_history",
    description: "获取指定频道的最近消息历史",
    command: "get_message_history",
    parameters: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "频道 ID" },
        count: { type: "number", description: "获取条数，默认 20" },
      },
      required: ["channel_id"],
    },
  },
  {
    name: "add_reaction",
    description: "为指定消息添加表情反应",
    command: "add_reaction",
    parameters: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "频道 ID" },
        message_id: { type: "string", description: "消息 ID" },
        emoji: { type: "string", description: "表情符号（如 👍 或自定义表情 ID）" },
      },
      required: ["channel_id", "message_id", "emoji"],
    },
  },
];

/* ------------------------------------------------------------------ */
/*  辅助函数：获取文本频道                                                */
/* ------------------------------------------------------------------ */

async function fetchTextChannel(
  client: Client,
  channelId: string
): Promise<TextChannel> {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error(`频道 ${channelId} 不存在或不是文本频道`);
  }
  return channel;
}

/* ------------------------------------------------------------------ */
/*  创建处理器                                                          */
/* ------------------------------------------------------------------ */

function createHandlers(client: Client): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 发送消息
  handlers.set("send_discord_message", async (ctx) => {
    try {
      const { channel_id, text } = ctx.args;
      const channel = await fetchTextChannel(client, channel_id);
      const msg = await channel.send({ content: text });
      return `✅ 消息已发送到频道 #${channel.name}，消息 ID: ${msg.id}`;
    } catch (err: any) {
      return `❌ 发送消息失败: ${err.message}`;
    }
  });

  // 回复消息
  handlers.set("reply_discord_message", async (ctx) => {
    try {
      const { channel_id, message_id, text } = ctx.args;
      const channel = await fetchTextChannel(client, channel_id);
      const targetMsg = await channel.messages.fetch(message_id);
      const reply = await targetMsg.reply(text);
      return `✅ 已回复消息 ${message_id}，回复消息 ID: ${reply.id}`;
    } catch (err: any) {
      return `❌ 回复消息失败: ${err.message}`;
    }
  });

  // 编辑消息
  handlers.set("edit_discord_message", async (ctx) => {
    try {
      const { channel_id, message_id, text } = ctx.args;
      const channel = await fetchTextChannel(client, channel_id);
      const msg = await channel.messages.fetch(message_id);
      await msg.edit(text);
      return `✅ 消息 ${message_id} 已编辑成功`;
    } catch (err: any) {
      return `❌ 编辑消息失败: ${err.message}`;
    }
  });

  // 删除消息
  handlers.set("delete_discord_message", async (ctx) => {
    try {
      const { channel_id, message_id } = ctx.args;
      const channel = await fetchTextChannel(client, channel_id);
      const msg = await channel.messages.fetch(message_id);
      await msg.delete();
      return `✅ 消息 ${message_id} 已删除`;
    } catch (err: any) {
      return `❌ 删除消息失败: ${err.message}`;
    }
  });

  // 获取消息历史
  handlers.set("get_message_history", async (ctx) => {
    try {
      const { channel_id, count } = ctx.args;
      const limit = count ?? 20;
      const channel = await fetchTextChannel(client, channel_id);
      const messages = await channel.messages.fetch({ limit });

      // 按时间正序排列
      const sorted = [...messages.values()].reverse();
      const lines = sorted.map((m) => {
        const time = m.createdAt.toLocaleString("zh-CN");
        return `[${time}] ${m.author.username}: ${m.content || "(非文本内容)"}`;
      });

      return `📜 频道 #${channel.name} 最近 ${sorted.length} 条消息:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `❌ 获取消息历史失败: ${err.message}`;
    }
  });

  // 添加表情反应
  handlers.set("add_reaction", async (ctx) => {
    try {
      const { channel_id, message_id, emoji } = ctx.args;
      const channel = await fetchTextChannel(client, channel_id);
      const msg = await channel.messages.fetch(message_id);
      await msg.react(emoji);
      return `✅ 已为消息 ${message_id} 添加表情 ${emoji}`;
    } catch (err: any) {
      return `❌ 添加表情失败: ${err.message}`;
    }
  });

  return handlers;
}

/* ------------------------------------------------------------------ */
/*  导出模块                                                            */
/* ------------------------------------------------------------------ */

export const messagingTools: ToolModule = {
  definitions,
  createHandlers,
};
