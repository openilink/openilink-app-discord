/**
 * 频道工具模块测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { channelTools } from "../../src/tools/channels.js";
import { Client, Collection } from "discord.js";

function createMockClient(): any {
  const mockMessage = {
    id: "msg-001",
    startThread: vi.fn().mockResolvedValue({ id: "thread-001", name: "测试线程" }),
    pin: vi.fn().mockResolvedValue({}),
  };

  const mockChannel = {
    id: "ch-001",
    name: "测试频道",
    type: 0, // GuildText
    topic: "频道主题",
    nsfw: false,
    createdAt: new Date("2024-01-01"),
    messages: {
      fetch: vi.fn().mockResolvedValue(mockMessage),
    },
  };

  const channelCollection = new Collection();
  channelCollection.set("ch-001", mockChannel);

  const mockGuild = {
    name: "测试服务器",
    channels: {
      fetch: vi.fn().mockResolvedValue(channelCollection),
      create: vi.fn().mockResolvedValue({ id: "new-ch-001", name: "新频道" }),
    },
  };

  return {
    guilds: {
      fetch: vi.fn().mockResolvedValue(mockGuild),
    },
    channels: {
      fetch: vi.fn().mockResolvedValue(mockChannel),
    },
    _mockGuild: mockGuild,
    _mockChannel: mockChannel,
  };
}

describe("channelTools", () => {
  describe("definitions", () => {
    it("应包含 5 个工具定义", () => {
      expect(channelTools.definitions.length).toBe(5);
    });

    it("应包含 list_channels 工具", () => {
      const tool = channelTools.definitions.find((d) => d.name === "list_channels");
      expect(tool).toBeDefined();
    });

    it("应包含 create_channel 工具", () => {
      const tool = channelTools.definitions.find((d) => d.name === "create_channel");
      expect(tool).toBeDefined();
      expect(tool!.parameters!.required).toContain("guild_id");
      expect(tool!.parameters!.required).toContain("name");
    });
  });

  describe("handlers", () => {
    let mockClient: any;
    let handlers: Map<string, any>;

    beforeEach(() => {
      mockClient = createMockClient();
      handlers = channelTools.createHandlers(mockClient as unknown as Client);
    });

    it("list_channels handler 应返回频道列表", async () => {
      const handler = handlers.get("list_channels");
      expect(handler).toBeDefined();

      const result = await handler!({
        installationId: "1",
        botId: "bot-1",
        userId: "user-1",
        traceId: "trace-1",
        args: { guild_id: "guild-001" },
      });

      expect(result).toContain("测试服务器");
    });

    it("create_thread handler 应创建线程", async () => {
      const handler = handlers.get("create_thread");
      expect(handler).toBeDefined();

      const result = await handler!({
        installationId: "1",
        botId: "bot-1",
        userId: "user-1",
        traceId: "trace-1",
        args: { channel_id: "ch-001", message_id: "msg-001", name: "新线程" },
      });

      expect(result).toContain("线程");
    });

    it("create_channel handler 应创建频道", async () => {
      const handler = handlers.get("create_channel");
      expect(handler).toBeDefined();

      const result = await handler!({
        installationId: "1",
        botId: "bot-1",
        userId: "user-1",
        traceId: "trace-1",
        args: { guild_id: "guild-001", name: "新频道" },
      });

      expect(result).toContain("已");
    });
  });
});
