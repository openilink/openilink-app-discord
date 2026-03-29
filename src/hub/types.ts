/**
 * Hub 协议相关类型定义
 */

/** Hub 推送的事件结构 */
export interface HubEvent {
  /** 协议版本 */
  v: number;
  /** 事件类型: event 为正常事件，url_verification 为验证回调 */
  type: "event" | "url_verification";
  /** 追踪 ID */
  trace_id: string;
  /** url_verification 时返回的挑战字符串 */
  challenge?: string;
  /** 安装 ID */
  installation_id: string;
  /** 机器人信息 */
  bot: { id: string };
  /** 具体事件内容 */
  event?: {
    type: string;
    id: string;
    timestamp: number;
    data: Record<string, unknown>;
  };
}

/** 安装记录 */
export interface Installation {
  id: string;
  hubUrl: string;
  appId: string;
  botId: string;
  appToken: string;
  webhookSecret: string;
  createdAt: string;
}

/** 消息关联记录 — 关联 Discord 消息与微信用户 */
export interface MessageLink {
  id?: number;
  installationId: string;
  discordMessageId: string;
  discordChannelId: string;
  wxUserId: string;
  wxUserName: string;
  createdAt?: string;
}

/** 工具定义 */
export interface ToolDefinition {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 工具命令标识 */
  command: string;
  /** 工具参数定义 */
  parameters?: Record<string, unknown>;
}

/** 工具调用上下文 */
export interface ToolContext {
  installationId: string;
  botId: string;
  userId: string;
  traceId: string;
  args: Record<string, unknown>;
}

/** 工具执行结果 - 支持纯文本和媒体类型 */
export interface ToolResult {
  /** 回复文本 */
  reply: string;
  /** 媒体类型，不传表示纯文本 */
  type?: "image";
  /** 媒体 URL */
  url?: string;
  /** 媒体 base64 数据 (data:image/png;base64,...) */
  base64?: string;
}

/** 工具处理函数类型 - 返回字符串（纯文本）或 ToolResult（支持媒体） */
export type ToolHandler = (ctx: ToolContext) => Promise<string | ToolResult>;
