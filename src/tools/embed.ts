/**
 * Embed 富文本消息工具模块
 * 支持发送带有标题、描述、颜色和字段的 Embed 消息
 */

import { Client, TextChannel, EmbedBuilder } from "discord.js";

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
    name: "send_embed",
    description: "发送 Embed 富文本消息到指定频道",
    command: "send_embed",
    parameters: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "目标频道 ID" },
        title: { type: "string", description: "Embed 标题" },
        description: { type: "string", description: "Embed 描述内容" },
        color: {
          type: "string",
          description: 'Hex 颜色值，如 "#0099FF"，默认为蓝色',
        },
        fields: {
          type: "string",
          description:
            'JSON 数组字符串，格式: [{"name":"字段名","value":"字段值","inline":false}]',
        },
      },
      required: ["channel_id", "title", "description"],
    },
  },
];

/* ------------------------------------------------------------------ */
/*  创建处理器                                                          */
/* ------------------------------------------------------------------ */

function createHandlers(client: Client): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  handlers.set("send_embed", async (ctx) => {
    try {
      const { channel_id, title, description, color, fields } = ctx.args;

      // 获取频道
      const channel = await client.channels.fetch(channel_id);
      if (!channel || !(channel instanceof TextChannel)) {
        return `❌ 频道 ${channel_id} 不存在或不是文本频道`;
      }

      // 构建 Embed
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description);

      // 设置颜色（将 hex 字符串转为数字）
      if (color) {
        const hexColor = color.replace("#", "");
        embed.setColor(parseInt(hexColor, 16));
      } else {
        // 默认蓝色
        embed.setColor(0x0099ff);
      }

      // 解析并添加字段
      if (fields) {
        try {
          const fieldArray: Array<{
            name: string;
            value: string;
            inline?: boolean;
          }> = JSON.parse(fields);

          for (const field of fieldArray) {
            embed.addFields({
              name: field.name,
              value: field.value,
              inline: field.inline ?? false,
            });
          }
        } catch {
          return `❌ fields 参数 JSON 解析失败，请检查格式`;
        }
      }

      // 发送 Embed
      const msg = await channel.send({ embeds: [embed] });

      const fieldCount = fields ? JSON.parse(fields).length : 0;
      return `✅ Embed 消息已发送到频道 #${channel.name}，消息 ID: ${msg.id}，标题: "${title}"，包含 ${fieldCount} 个字段`;
    } catch (err: any) {
      return `❌ 发送 Embed 失败: ${err.message}`;
    }
  });

  return handlers;
}

/* ------------------------------------------------------------------ */
/*  导出模块                                                            */
/* ------------------------------------------------------------------ */

export const embedTools: ToolModule = {
  definitions,
  createHandlers,
};
