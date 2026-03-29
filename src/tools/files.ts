/**
 * 文件上传工具模块
 * 由于 Tool 无法接收二进制数据，此模块仅作占位提示
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
    name: "upload_file",
    description: "上传文件到指定 Discord 频道（当前版本仅返回提示信息）",
    command: "upload_file",
    parameters: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "目标频道 ID" },
        filename: { type: "string", description: "文件名" },
      },
      required: ["channel_id", "filename"],
    },
  },
];

/* ------------------------------------------------------------------ */
/*  创建处理器                                                          */
/* ------------------------------------------------------------------ */

function createHandlers(_client: Client): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  handlers.set("upload_file", async (ctx) => {
    try {
      const { channel_id, filename } = ctx.args;
      return (
        `⚠️ 文件上传功能受限提示:\n` +
        `  目标频道: ${channel_id}\n` +
        `  文件名: ${filename}\n` +
        `  当前 Tool 接口无法直接接收二进制文件数据。` +
        `如需上传文件，请通过 Bot 的文件上传接口或其他方式传递文件内容。`
      );
    } catch (err: any) {
      return `❌ 文件上传处理失败: ${err.message}`;
    }
  });

  return handlers;
}

/* ------------------------------------------------------------------ */
/*  导出模块                                                            */
/* ------------------------------------------------------------------ */

export const fileTools: ToolModule = {
  definitions,
  createHandlers,
};
