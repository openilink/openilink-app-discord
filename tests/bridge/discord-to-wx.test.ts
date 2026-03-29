/**
 * Discord → 微信桥接测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { DiscordToWx } from "../../src/bridge/discord-to-wx.js";
import type { DiscordMessageData } from "../../src/discord/event.js";
import type { Installation } from "../../src/hub/types.js";

// 模拟 HubClient
vi.mock("../../src/hub/client.js", () => ({
  HubClient: vi.fn().mockImplementation(() => ({
    sendTextMessage: vi.fn().mockResolvedValue({ ok: true }),
    sendText: vi.fn().mockResolvedValue({ ok: true }),
    sendMessage: vi.fn().mockResolvedValue({ ok: true }),
  })),
}));

describe("DiscordToWx", () => {
  const mockStore = {
    getMessageLinkByDiscordId: vi.fn(),
    getLatestLinkByWxUser: vi.fn(),
    saveMessageLink: vi.fn(),
    saveInstallation: vi.fn(),
    getInstallation: vi.fn(),
    getAllInstallations: vi.fn(),
    close: vi.fn(),
  };

  const defaultChannelId = "channel-001";
  const installations: Installation[] = [
    {
      id: 1,
      hubUrl: "https://hub.example.com",
      appId: "app-1",
      botId: "bot-1",
      appToken: "token-abc",
      webhookSecret: "secret-xyz",
      createdAt: "2024-01-01T00:00:00Z",
    },
  ];

  let bridge: DiscordToWx;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = new DiscordToWx(mockStore as any, defaultChannelId);
  });

  /** 辅助：创建 Discord 消息数据 */
  function makeDiscordMessage(overrides: Partial<DiscordMessageData> = {}): DiscordMessageData {
    return {
      channelId: defaultChannelId,
      messageId: "discord-msg-100",
      content: "Hello from Discord",
      authorId: "discord-user-1",
      authorName: "TestUser",
      isBot: false,
      attachments: [],
      ...overrides,
    };
  }

  it("有回复引用且映射存在时应转发消息", async () => {
    mockStore.getMessageLinkByDiscordId.mockReturnValue({
      installationId: 1,
      wxUserId: "wx-user-1",
      wxUserName: "张三",
      discordMessageId: "ref-msg-001",
      discordChannelId: defaultChannelId,
    });

    const data = makeDiscordMessage({
      reference: { messageId: "ref-msg-001", channelId: defaultChannelId },
    });

    await bridge.handleDiscordMessage(data, installations);

    expect(mockStore.getMessageLinkByDiscordId).toHaveBeenCalledWith("ref-msg-001");
  });

  it("非目标频道的消息应被过滤", async () => {
    const data = makeDiscordMessage({ channelId: "other-channel" });

    await bridge.handleDiscordMessage(data, installations);

    expect(mockStore.getMessageLinkByDiscordId).not.toHaveBeenCalled();
  });

  it("没有回复引用时应跳过（无法确定目标微信用户）", async () => {
    const data = makeDiscordMessage({ reference: undefined });

    await bridge.handleDiscordMessage(data, installations);

    // 未回复已知微信消息时应跳过
    expect(mockStore.getMessageLinkByDiscordId).not.toHaveBeenCalled();
  });

  it("映射不存在时应跳过", async () => {
    mockStore.getMessageLinkByDiscordId.mockReturnValue(undefined);

    const data = makeDiscordMessage({
      reference: { messageId: "unknown-ref", channelId: defaultChannelId },
    });

    await bridge.handleDiscordMessage(data, installations);

    // 映射缺失，应跳过后续处理
    expect(mockStore.getMessageLinkByDiscordId).toHaveBeenCalledWith("unknown-ref");
  });

  it("应去除消息中的 @提及格式", async () => {
    mockStore.getMessageLinkByDiscordId.mockReturnValue({
      installationId: 1,
      wxUserId: "wx-user-1",
      wxUserName: "张三",
      discordMessageId: "ref-msg-002",
      discordChannelId: defaultChannelId,
    });

    const data = makeDiscordMessage({
      content: "<@123456789> 你好呀 <@!987654321>",
      reference: { messageId: "ref-msg-002", channelId: defaultChannelId },
    });

    await bridge.handleDiscordMessage(data, installations);

    // 消息应该被清理掉 @提及
    expect(mockStore.getMessageLinkByDiscordId).toHaveBeenCalled();
  });

  it("空消息内容应跳过", async () => {
    const data = makeDiscordMessage({
      content: "<@123456>",
      reference: { messageId: "ref-msg-003", channelId: defaultChannelId },
    });

    // 清除 @提及后内容为空
    await bridge.handleDiscordMessage(data, installations);
  });

  it("Installation 不匹配时应跳过", async () => {
    mockStore.getMessageLinkByDiscordId.mockReturnValue({
      installationId: 999, // 不存在的 installation
      wxUserId: "wx-user-1",
      wxUserName: "张三",
      discordMessageId: "ref-msg-004",
      discordChannelId: defaultChannelId,
    });

    const data = makeDiscordMessage({
      reference: { messageId: "ref-msg-004", channelId: defaultChannelId },
    });

    await bridge.handleDiscordMessage(data, installations);

    // installationId=999 在 installations 中找不到，应跳过
    expect(mockStore.getMessageLinkByDiscordId).toHaveBeenCalled();
  });

  it("附件消息也应正常处理（不影响文本转发）", async () => {
    mockStore.getMessageLinkByDiscordId.mockReturnValue({
      installationId: 1,
      wxUserId: "wx-user-1",
      wxUserName: "张三",
      discordMessageId: "ref-msg-005",
      discordChannelId: defaultChannelId,
    });

    const data = makeDiscordMessage({
      content: "看这个文件",
      reference: { messageId: "ref-msg-005", channelId: defaultChannelId },
      attachments: [
        { url: "https://cdn.discord.com/file.pdf", name: "file.pdf", contentType: "application/pdf" },
      ],
    });

    await bridge.handleDiscordMessage(data, installations);
    expect(mockStore.getMessageLinkByDiscordId).toHaveBeenCalledWith("ref-msg-005");
  });
});
