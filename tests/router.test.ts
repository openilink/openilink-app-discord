/**
 * 路由器测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Router } from "../src/router.js";
import type { HubEvent, Installation, ToolHandler } from "../src/hub/types.js";

describe("Router", () => {
  const mockHandler = vi.fn<Parameters<ToolHandler>, ReturnType<ToolHandler>>();
  const handlers = new Map<string, ToolHandler>();

  const mockHubClient = {
    sendText: vi.fn().mockResolvedValue({ ok: true }),
    sendMessage: vi.fn().mockResolvedValue({ ok: true }),
    sendImage: vi.fn().mockResolvedValue({ ok: true }),
    sendFile: vi.fn().mockResolvedValue({ ok: true }),
  };

  const installation: Installation = {
    id: 1,
    hubUrl: "https://hub.example.com",
    appId: "app-1",
    botId: "bot-1",
    appToken: "token-abc",
    webhookSecret: "secret-xyz",
    createdAt: "2024-01-01T00:00:00Z",
  };

  let router: Router;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    mockHandler.mockResolvedValue("执行成功");
    handlers.set("send_discord_message", mockHandler);
    handlers.set("list_channels", mockHandler);
    router = new Router(handlers);
  });

  /** 辅助：创建命令事件 */
  function makeCommandEvent(commandName: string, args: Record<string, unknown> = {}): HubEvent {
    return {
      v: 1,
      type: "event",
      trace_id: "trace-cmd-1",
      installation_id: 1,
      bot: { id: "bot-1" },
      event: {
        type: "command",
        id: "evt-cmd-1",
        timestamp: Date.now(),
        data: {
          command: commandName,
          sender: { id: "wx-user-1" },
          args,
        },
      },
    };
  }

  it("应正确路由已注册的命令", async () => {
    const event = makeCommandEvent("send_discord_message", {
      channel_id: "ch-1",
      text: "测试",
    });

    const result = await router.handleCommand(event, installation, mockHubClient as any);

    expect(result).toBe("执行成功");
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  it("命令名称带 / 前缀时应正确去除", async () => {
    const event = makeCommandEvent("/send_discord_message", {
      channel_id: "ch-1",
      text: "测试",
    });

    const result = await router.handleCommand(event, installation, mockHubClient as any);

    expect(result).toBe("执行成功");
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  it("未知命令应返回 null", async () => {
    const event = makeCommandEvent("unknown_command");

    const result = await router.handleCommand(event, installation, mockHubClient as any);

    expect(result).toBeNull();
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it("事件缺少 data 字段时应返回 null", async () => {
    const event: HubEvent = {
      v: 1,
      type: "event",
      trace_id: "trace-cmd-2",
      installation_id: 1,
      bot: { id: "bot-1" },
      event: {
        type: "command",
        id: "evt-cmd-2",
        timestamp: Date.now(),
        data: {},
      },
    };

    // data 中没有 command 或 name 字段
    const result = await router.handleCommand(event, installation, mockHubClient as any);

    expect(result).toBeNull();
  });

  it("handler 抛出异常时应返回错误消息", async () => {
    mockHandler.mockRejectedValue(new Error("Discord API 错误"));

    const event = makeCommandEvent("send_discord_message");

    const result = await router.handleCommand(event, installation, mockHubClient as any);

    expect(result).toContain("命令执行失败");
    expect(result).toContain("Discord API 错误");
  });

  it("应将正确的 ToolContext 传递给 handler", async () => {
    const event = makeCommandEvent("list_channels", { guild_id: "guild-1" });

    await router.handleCommand(event, installation, mockHubClient as any);

    expect(mockHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        installationId: 1,
        botId: "bot-1",
        traceId: "trace-cmd-1",
        args: { guild_id: "guild-1" },
      }),
    );
  });
});
