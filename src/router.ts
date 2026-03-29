/**
 * 命令路由器
 * 从 Hub 事件中提取命令名称，查找对应的 ToolHandler 并执行
 */

import type { ToolHandler, ToolContext, HubEvent, Installation, ToolResult } from "./hub/types.js";
import { HubClient } from "./hub/client.js";

export class Router {
  private handlers: Map<string, ToolHandler>;

  constructor(handlers: Map<string, ToolHandler>) {
    this.handlers = handlers;
  }

  /**
   * 处理命令事件
   * 从 event.event.data 提取 command/name，去掉 "/" 前缀后查找 handler 执行
   *
   * @param event - Hub 推送的事件
   * @param installation - 应用安装信息
   * @param hubClient - Hub API 客户端（用于回复消息）
   * @returns 工具执行结果（字符串或 ToolResult），未找到命令时返回 null
   */
  async handleCommand(
    event: HubEvent,
    installation: Installation,
    hubClient: HubClient,
  ): Promise<string | ToolResult | null> {
    const data = event.event?.data;
    if (!data) {
      console.warn("[Router] 事件缺少 data 字段");
      return null;
    }

    // 提取命令名称（支持 data.command 或 data.name）
    let commandName = (data.command ?? data.name) as string | undefined;
    if (!commandName) {
      console.warn("[Router] 事件中未找到命令名称");
      return null;
    }

    // 去掉 "/" 前缀
    if (commandName.startsWith("/")) {
      commandName = commandName.slice(1);
    }

    // 查找对应的 handler
    const handler = this.handlers.get(commandName);
    if (!handler) {
      console.warn(`[Router] 未找到命令处理器: ${commandName}`);
      return null;
    }

    // 构造 ToolContext
    const ctx: ToolContext = {
      installationId: installation.id,
      botId: event.bot.id,
      userId: ((data as Record<string, any>).sender?.id ?? (data as Record<string, any>).user_id ?? (data as Record<string, any>).from ?? "") as string,
      traceId: event.trace_id,
      args: (data.args as Record<string, unknown>) ?? {},
    };

    console.log(`[Router] 执行命令: ${commandName}, traceId=${event.trace_id}`);

    try {
      const result = await handler(ctx);
      return result;
    } catch (err) {
      console.error(`[Router] 命令 ${commandName} 执行失败:`, err);
      return `命令执行失败: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}
