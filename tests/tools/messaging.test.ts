/**
 * 消息工具模块测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { messagingTools } from "../../src/tools/messaging.js";
import { Client, TextChannel, Collection } from "discord.js";

// 模拟 Discord.js Client
function createMockClient(): any {
  const mockMessage = {
    id: "msg-001",
    content: "测试消息",
    reply: vi.fn().mockResolvedValue({ id: "reply-001" }),
    edit: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    react: vi.fn().mockResolvedValue({}),
    author: { tag: "TestUser#1234" },
    createdAt: new Date("2024-01-01T00:00:00Z"),
  };

  // 使用 Object.create 以通过 instanceof TextChannel 检查
  const mockChannel = Object.create(TextChannel.prototype);
  Object.assign(mockChannel, {
    id: "ch-001",
    name: "测试频道",
    send: vi.fn().mockResolvedValue({ id: "msg-001" }),
    messages: {
      fetch: vi.fn().mockImplementation((opts: any) => {
        // 如果传入的是字符串或没有 limit，返回单条消息
        if (typeof opts === "string" || !opts?.limit) {
          return Promise.resolve(mockMessage);
        }
        // 如果传入 limit，返回消息集合
        const coll = new Collection();
        coll.set("msg-001", mockMessage);
        return Promise.resolve(coll);
      }),
    },
  });

  return {
    channels: {
      fetch: vi.fn().mockResolvedValue(mockChannel),
    },
    _mockChannel: mockChannel,
    _mockMessage: mockMessage,
  };
}

describe("messagingTools", () => {
  describe("definitions", () => {
    it("应包含 6 个工具定义", () => {
      expect(messagingTools.definitions.length).toBe(6);
    });

    it("应包含 send_discord_message 工具", () => {
      const tool = messagingTools.definitions.find((d) => d.name === "send_discord_message");
      expect(tool).toBeDefined();
      expect(tool!.command).toBe("send_discord_message");
    });

    it("应包含 reply_discord_message 工具", () => {
      const tool = messagingTools.definitions.find((d) => d.name === "reply_discord_message");
      expect(tool).toBeDefined();
    });

    it("每个工具都应有 parameters 定义", () => {
      for (const def of messagingTools.definitions) {
        expect(def.parameters).toBeDefined();
        expect(def.parameters!.type).toBe("object");
      }
    });
  });

  describe("handlers", () => {
    let mockClient: any;
    let handlers: Map<string, any>;

    beforeEach(() => {
      mockClient = createMockClient();
      handlers = messagingTools.createHandlers(mockClient as unknown as Client);
    });

    it("send_discord_message handler 应发送消息", async () => {
      const handler = handlers.get("send_discord_message");
      expect(handler).toBeDefined();

      const result = await handler!({
        installationId: "1",
        botId: "bot-1",
        userId: "user-1",
        traceId: "trace-1",
        args: { channel_id: "ch-001", text: "Hello" },
      });

      expect(result).toContain("已发送");
      expect(mockClient._mockChannel.send).toHaveBeenCalled();
    });

    it("reply_discord_message handler 应回复消息", async () => {
      const handler = handlers.get("reply_discord_message");
      expect(handler).toBeDefined();

      const result = await handler!({
        installationId: "1",
        botId: "bot-1",
        userId: "user-1",
        traceId: "trace-1",
        args: { channel_id: "ch-001", message_id: "msg-001", text: "回复内容" },
      });

      expect(result).toContain("已回复");
    });

    it("edit_discord_message handler 应编辑消息", async () => {
      const handler = handlers.get("edit_discord_message");
      expect(handler).toBeDefined();

      const result = await handler!({
        installationId: "1",
        botId: "bot-1",
        userId: "user-1",
        traceId: "trace-1",
        args: { channel_id: "ch-001", message_id: "msg-001", text: "编辑后内容" },
      });

      expect(result).toContain("已编辑");
    });

    it("delete_discord_message handler 应删除消息", async () => {
      const handler = handlers.get("delete_discord_message");
      expect(handler).toBeDefined();

      const result = await handler!({
        installationId: "1",
        botId: "bot-1",
        userId: "user-1",
        traceId: "trace-1",
        args: { channel_id: "ch-001", message_id: "msg-001" },
      });

      expect(result).toContain("已删除");
    });
  });
});
