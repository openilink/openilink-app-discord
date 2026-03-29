/**
 * 微信 → Discord 桥接测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { WxToDiscord } from "../../src/bridge/wx-to-discord.js";
import type { HubEvent, Installation } from "../../src/hub/types.js";

describe("WxToDiscord", () => {
  const mockDiscordClient = {
    sendEmbed: vi.fn().mockResolvedValue("discord-msg-001"),
    sendText: vi.fn().mockResolvedValue("discord-msg-002"),
    bot: {},
  };

  const mockStore = {
    saveMessageLink: vi.fn(),
    getMessageLinkByDiscordId: vi.fn(),
    getLatestLinkByWxUser: vi.fn(),
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

  const defaultChannelId = "channel-001";
  let bridge: WxToDiscord;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = new WxToDiscord(mockDiscordClient as any, mockStore as any, defaultChannelId);
  });

  /** 辅助：创建 HubEvent */
  function makeEvent(type: string, data: Record<string, unknown> = {}): HubEvent {
    return {
      v: 1,
      type: "event",
      trace_id: "trace-1",
      installation_id: 1,
      bot: { id: "bot-1" },
      event: {
        type,
        id: "evt-1",
        timestamp: Date.now(),
        data: {
          sender: { id: "wx-user-1", name: "张三" },
          ...data,
        },
      },
    };
  }

  it("应将文本消息以 Embed 格式发送到 Discord", async () => {
    const event = makeEvent("message.text", { content: "你好 Discord" });
    await bridge.handleWxEvent(event, installation);

    expect(mockDiscordClient.sendEmbed).toHaveBeenCalledTimes(1);
    expect(mockDiscordClient.sendEmbed).toHaveBeenCalledWith(
      defaultChannelId,
      expect.anything(),
    );
  });

  it("应处理图片消息（提示 [发送了图片]）", async () => {
    const event = makeEvent("message.image");
    await bridge.handleWxEvent(event, installation);

    expect(mockDiscordClient.sendEmbed).toHaveBeenCalledTimes(1);
  });

  it("应处理语音消息", async () => {
    const event = makeEvent("message.voice");
    await bridge.handleWxEvent(event, installation);

    expect(mockDiscordClient.sendEmbed).toHaveBeenCalledTimes(1);
  });

  it("应处理视频消息", async () => {
    const event = makeEvent("message.video");
    await bridge.handleWxEvent(event, installation);

    expect(mockDiscordClient.sendEmbed).toHaveBeenCalledTimes(1);
  });

  it("应处理文件消息", async () => {
    const event = makeEvent("message.file", { fileName: "doc.pdf" });
    await bridge.handleWxEvent(event, installation);

    expect(mockDiscordClient.sendEmbed).toHaveBeenCalledTimes(1);
  });

  it("command 类型事件应跳过", async () => {
    const event = makeEvent("command", { command: "/test" });
    await bridge.handleWxEvent(event, installation);

    expect(mockDiscordClient.sendEmbed).not.toHaveBeenCalled();
  });

  it("未知消息类型应正常处理", async () => {
    const event = makeEvent("message.unknown");
    await bridge.handleWxEvent(event, installation);

    expect(mockDiscordClient.sendEmbed).toHaveBeenCalledTimes(1);
  });

  it("应保存消息映射记录", async () => {
    const event = makeEvent("message.text", { content: "测试消息" });
    await bridge.handleWxEvent(event, installation);

    expect(mockStore.saveMessageLink).toHaveBeenCalledTimes(1);
    expect(mockStore.saveMessageLink).toHaveBeenCalledWith(
      expect.objectContaining({
        installationId: 1,
        discordMessageId: "discord-msg-001",
        discordChannelId: defaultChannelId,
        wxUserId: "wx-user-1",
      }),
    );
  });
});
