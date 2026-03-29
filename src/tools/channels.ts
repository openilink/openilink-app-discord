/**
 * 频道相关工具模块
 * 包含列出频道、获取频道信息、创建频道、创建线程、Pin 消息等操作
 */

import { Client, TextChannel, ChannelType } from "discord.js";

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
    name: "list_channels",
    description: "列出指定服务器中的所有频道",
    command: "list_channels",
    parameters: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "服务器 ID" },
      },
      required: ["guild_id"],
    },
  },
  {
    name: "get_channel_info",
    description: "获取指定频道的详细信息",
    command: "get_channel_info",
    parameters: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "频道 ID" },
      },
      required: ["channel_id"],
    },
  },
  {
    name: "create_channel",
    description: "在指定服务器中创建新频道",
    command: "create_channel",
    parameters: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "服务器 ID" },
        name: { type: "string", description: "频道名称" },
        type: {
          type: "string",
          description: '频道类型: "text" 或 "voice"，默认 "text"',
        },
      },
      required: ["guild_id", "name"],
    },
  },
  {
    name: "create_thread",
    description: "基于某条消息创建一个线程",
    command: "create_thread",
    parameters: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "频道 ID" },
        message_id: { type: "string", description: "消息 ID" },
        name: { type: "string", description: "线程名称" },
      },
      required: ["channel_id", "message_id", "name"],
    },
  },
  {
    name: "pin_message",
    description: "将指定消息固定（Pin）到频道",
    command: "pin_message",
    parameters: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "频道 ID" },
        message_id: { type: "string", description: "消息 ID" },
      },
      required: ["channel_id", "message_id"],
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
/*  频道类型名称映射                                                     */
/* ------------------------------------------------------------------ */

function channelTypeName(type: ChannelType): string {
  const map: Record<number, string> = {
    [ChannelType.GuildText]: "文本频道",
    [ChannelType.GuildVoice]: "语音频道",
    [ChannelType.GuildCategory]: "分类",
    [ChannelType.GuildAnnouncement]: "公告频道",
    [ChannelType.GuildStageVoice]: "舞台频道",
    [ChannelType.GuildForum]: "论坛频道",
    [ChannelType.PublicThread]: "公开线程",
    [ChannelType.PrivateThread]: "私有线程",
  };
  return map[type] ?? `未知类型(${type})`;
}

/* ------------------------------------------------------------------ */
/*  创建处理器                                                          */
/* ------------------------------------------------------------------ */

function createHandlers(client: Client): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 列出服务器频道
  handlers.set("list_channels", async (ctx) => {
    try {
      const { guild_id } = ctx.args;
      const guild = await client.guilds.fetch(guild_id);
      const channels = await guild.channels.fetch();

      const lines = channels
        .filter((ch) => ch !== null)
        .map((ch) => {
          return `  - #${ch!.name} (ID: ${ch!.id}, 类型: ${channelTypeName(ch!.type)})`;
        });

      return `📋 服务器「${guild.name}」共有 ${lines.length} 个频道:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `❌ 获取频道列表失败: ${err.message}`;
    }
  });

  // 获取频道信息
  handlers.set("get_channel_info", async (ctx) => {
    try {
      const { channel_id } = ctx.args;
      const channel = await client.channels.fetch(channel_id);
      if (!channel) {
        return `❌ 频道 ${channel_id} 不存在`;
      }

      const info: string[] = [
        `📌 频道信息:`,
        `  名称: ${("name" in channel && channel.name) || "未知"}`,
        `  ID: ${channel.id}`,
        `  类型: ${channelTypeName(channel.type)}`,
      ];

      // 如果是文本频道，补充 topic 信息
      if (channel instanceof TextChannel) {
        info.push(`  主题: ${channel.topic || "无"}`);
        info.push(`  NSFW: ${channel.nsfw ? "是" : "否"}`);
        info.push(`  创建时间: ${channel.createdAt?.toLocaleString("zh-CN") || "未知"}`);
      }

      return info.join("\n");
    } catch (err: any) {
      return `❌ 获取频道信息失败: ${err.message}`;
    }
  });

  // 创建频道
  handlers.set("create_channel", async (ctx) => {
    try {
      const { guild_id, name, type } = ctx.args;
      const guild = await client.guilds.fetch(guild_id);

      const channelType =
        type === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText;

      const newChannel = await guild.channels.create({
        name,
        type: channelType,
      });

      const typeLabel = type === "voice" ? "语音" : "文本";
      return `✅ 已在服务器「${guild.name}」创建${typeLabel}频道 #${newChannel.name} (ID: ${newChannel.id})`;
    } catch (err: any) {
      return `❌ 创建频道失败: ${err.message}`;
    }
  });

  // 创建线程
  handlers.set("create_thread", async (ctx) => {
    try {
      const { channel_id, message_id, name } = ctx.args;
      const channel = await fetchTextChannel(client, channel_id);
      const msg = await channel.messages.fetch(message_id);
      const thread = await msg.startThread({ name });

      return `✅ 已基于消息 ${message_id} 创建线程「${thread.name}」(ID: ${thread.id})`;
    } catch (err: any) {
      return `❌ 创建线程失败: ${err.message}`;
    }
  });

  // Pin 消息
  handlers.set("pin_message", async (ctx) => {
    try {
      const { channel_id, message_id } = ctx.args;
      const channel = await fetchTextChannel(client, channel_id);
      const msg = await channel.messages.fetch(message_id);
      await msg.pin();

      return `✅ 消息 ${message_id} 已固定到频道 #${channel.name}`;
    } catch (err: any) {
      return `❌ 固定消息失败: ${err.message}`;
    }
  });

  return handlers;
}

/* ------------------------------------------------------------------ */
/*  导出模块                                                            */
/* ------------------------------------------------------------------ */

export const channelTools: ToolModule = {
  definitions,
  createHandlers,
};
