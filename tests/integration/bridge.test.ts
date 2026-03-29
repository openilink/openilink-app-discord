/**
 * Discord Bridge 集成测试
 *
 * 测试 Hub <-> App 的完整通信链路，不依赖 Discord SDK：
 * 1. Mock Hub Server 模拟 OpeniLink Hub
 * 2. 创建轻量 App HTTP 服务器（仅含 webhook handler）
 * 3. 使用内存 SQLite 存储 + Mock DiscordClient
 * 4. 验证微信->Discord 和 Discord->微信的双向桥接
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import { Store } from "../../src/store.js";
import { handleWebhook } from "../../src/hub/webhook.js";
import { WxToDiscord } from "../../src/bridge/wx-to-discord.js";
import { DiscordToWx } from "../../src/bridge/discord-to-wx.js";
import type { DiscordMessageData } from "../../src/discord/event.js";
import type { Installation } from "../../src/hub/types.js";
import {
  startMockHub,
  injectMessage,
  getMessages,
  resetMock,
  waitFor,
  setInstallationId,
  MOCK_HUB_URL,
  MOCK_WEBHOOK_SECRET,
  MOCK_APP_TOKEN,
  MOCK_BOT_ID,
  APP_PORT,
} from "./setup.js";

// ─── Mock DiscordClient ───
// 模拟 Discord 客户端，不连接真实 Discord，仅记录发送的消息

/** 记录 sendEmbed 调用 */
let discordSentEmbeds: Array<{ channelId: string; embed: any; messageId: string }> = [];
/** 记录 sendText 调用 */
let discordSentTexts: Array<{ channelId: string; text: string; messageId: string }> = [];
/** 自增计数器，用于生成唯一消息 ID */
let discordMsgIdCounter = 0;

/**
 * 创建 Mock DiscordClient
 * 实现 sendEmbed 和 sendText 方法，返回模拟的消息 ID
 */
function createMockDiscordClient() {
  return {
    bot: {} as any,
    sendEmbed: async (channelId: string, embed: any): Promise<string> => {
      discordMsgIdCounter++;
      const messageId = `discord_msg_${discordMsgIdCounter}`;
      discordSentEmbeds.push({ channelId, embed, messageId });
      return messageId;
    },
    sendText: async (channelId: string, text: string): Promise<string> => {
      discordMsgIdCounter++;
      const messageId = `discord_msg_${discordMsgIdCounter}`;
      discordSentTexts.push({ channelId, text, messageId });
      return messageId;
    },
    replyText: async (channelId: string, _messageId: string, text: string): Promise<string> => {
      discordMsgIdCounter++;
      const id = `discord_reply_${discordMsgIdCounter}`;
      discordSentTexts.push({ channelId, text, messageId: id });
      return id;
    },
  };
}

// ─── 测试主体 ───

describe("Discord Bridge 集成测试", () => {
  let mockHubHandle: { server: http.Server; close: () => Promise<void> };
  let appServer: http.Server;
  let store: Store;
  let wxToDiscord: WxToDiscord;
  let discordToWx: DiscordToWx;
  let testInstallation: Installation;
  const defaultChannelId = "test_channel_001";

  beforeAll(async () => {
    // 1. 启动 Mock Hub Server
    mockHubHandle = await startMockHub();

    // 2. 初始化内存数据库和存储
    store = new Store(":memory:");

    // 3. 注入 installation 记录（Discord Store 的 id 是自增的）
    testInstallation = store.saveInstallation({
      hubUrl: MOCK_HUB_URL,
      appId: "test-app",
      botId: MOCK_BOT_ID,
      appToken: MOCK_APP_TOKEN,
      webhookSecret: MOCK_WEBHOOK_SECRET,
    });

    // 同步安装 ID 到 Mock Hub（构造 HubEvent 时需要使用正确的 installation_id）
    setInstallationId(testInstallation.id);

    // 4. 创建 Mock DiscordClient 和桥接模块
    const mockDiscord = createMockDiscordClient();
    wxToDiscord = new WxToDiscord(mockDiscord as any, store, defaultChannelId);
    discordToWx = new DiscordToWx(store, defaultChannelId);

    // 5. 启动轻量 App HTTP 服务器（只处理 /hub/webhook）
    appServer = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost:${APP_PORT}`);

      if (url.pathname === "/hub/webhook") {
        await handleWebhook(req, res, store, async (event) => {
          if (!event.event) return;
          const eventType = event.event.type;

          if (eventType.startsWith("message.")) {
            // 微信->Discord 桥接
            const installation = store.getInstallation(event.installation_id);
            if (installation) {
              await wxToDiscord.handleWxEvent(event, installation);
            }
          }
        });
        return;
      }

      // 健康检查
      if (url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      res.writeHead(404);
      res.end("Not Found");
    });

    await new Promise<void>((resolve, reject) => {
      appServer.on("error", reject);
      appServer.listen(APP_PORT, () => {
        console.log(`[test] App Server 已启动，端口 ${APP_PORT}`);
        resolve();
      });
    });
  });

  afterAll(async () => {
    // 关闭 App 服务器
    await new Promise<void>((resolve) =>
      appServer.close(() => {
        console.log("[test] App Server 已关闭");
        resolve();
      }),
    );

    // 关闭 Mock Hub Server
    await mockHubHandle.close();

    // 关闭数据库
    store.close();
  });

  beforeEach(() => {
    // 每个测试前重置消息记录（但不重置计数器，确保消息 ID 全局唯一）
    resetMock();
    discordSentEmbeds = [];
    discordSentTexts = [];
  });

  // ─── 健康检查 ───

  it("Mock Hub Server 健康检查", async () => {
    const res = await fetch(`${MOCK_HUB_URL}/health`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toEqual({ status: "ok" });
  });

  it("App Server 健康检查", async () => {
    const res = await fetch(`http://localhost:${APP_PORT}/health`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toEqual({ status: "ok" });
  });

  // ─── 微信->Discord 方向测试 ───

  it("微信文本消息应通过 Hub->App->Discord 链路转发", async () => {
    // Mock Hub 注入微信消息 -> 转发到 App webhook -> WxToDiscord 转发到 Discord
    await injectMessage("user_alice", "你好 Discord");

    // 等待 WxToDiscord 处理完成（Discord 端收到 Embed 消息）
    await waitFor(async () => discordSentEmbeds.length > 0, 5000);

    // 验证 Discord 端收到了 Embed 格式的转发消息
    expect(discordSentEmbeds.length).toBe(1);
    expect(discordSentEmbeds[0].channelId).toBe(defaultChannelId);
    // Embed 应包含发送者名称和消息内容
    const embed = discordSentEmbeds[0].embed;
    expect(embed.data.title).toBe("user_alice");
    expect(embed.data.description).toBe("你好 Discord");
  });

  it("多条微信消息应依次转发到 Discord", async () => {
    await injectMessage("user_alice", "第一条消息");
    await injectMessage("user_bob", "第二条消息");

    // 等待两条消息都转发完成
    await waitFor(async () => discordSentEmbeds.length >= 2, 5000);

    expect(discordSentEmbeds.length).toBe(2);
    expect(discordSentEmbeds[0].embed.data.description).toBe("第一条消息");
    expect(discordSentEmbeds[1].embed.data.description).toBe("第二条消息");
  });

  it("消息映射应正确保存到 Store", async () => {
    await injectMessage("user_charlie", "测试映射");

    await waitFor(async () => discordSentEmbeds.length > 0, 5000);

    // 验证 Store 中保存了消息映射
    const instId = Number(testInstallation.id);
    const link = store.getLatestLinkByWxUser("user_charlie", instId);
    expect(link).toBeDefined();
    expect(link!.wxUserId).toBe("user_charlie");
    expect(link!.wxUserName).toBe("user_charlie");
    expect(link!.installationId).toBe(testInstallation.id);
    // 消息 ID 应该是 Mock DiscordClient 生成的
    expect(link!.discordMessageId).toMatch(/^discord_msg_/);
    expect(link!.discordChannelId).toBe(defaultChannelId);
  });

  // ─── Discord->微信 方向测试 ───

  it("Discord 回复消息应通过 DiscordToWx->HubClient 转发到微信", async () => {
    // 先模拟一条微信->Discord 的消息，建立消息映射
    await injectMessage("user_dave", "你好，请回复我");

    await waitFor(async () => discordSentEmbeds.length > 0, 5000);

    // 获取映射中的 Discord 消息 ID
    const instId = Number(testInstallation.id);
    const link = store.getLatestLinkByWxUser("user_dave", instId);
    expect(link).toBeDefined();
    const discordMsgId = link!.discordMessageId;

    // 模拟 Discord 用户回复这条消息（通过 reference 引用）
    const discordReplyData: DiscordMessageData = {
      channelId: defaultChannelId,
      messageId: `discord_reply_${Date.now()}`,
      content: "收到，已处理",
      authorId: "discord_user_001",
      authorName: "TestUser",
      isBot: false,
      guildId: "test_guild",
      reference: {
        messageId: discordMsgId, // 引用之前转发的消息
        channelId: defaultChannelId,
      },
      attachments: [],
    };

    // 获取所有 installation 并触发 DiscordToWx 处理
    const installations = store.getAllInstallations();
    await discordToWx.handleDiscordMessage(discordReplyData, installations);

    // 等待 HubClient 将消息发送到 Mock Hub
    await waitFor(async () => {
      const msgs = await getMessages();
      return msgs.length > 0;
    }, 5000);

    // 验证 Mock Hub 收到了回复消息
    const hubMessages = await getMessages();
    expect(hubMessages.length).toBe(1);
    expect(hubMessages[0].receiver_id).toBe("user_dave");
    expect(hubMessages[0].msg_type).toBe("text");
    expect(hubMessages[0].content).toEqual({ text: "收到，已处理" });
  });

  it("Discord 回复不在映射中的消息应被忽略", async () => {
    // 模拟一条 Discord 消息，但 reference.messageId 在 Store 中没有对应映射
    const discordData: DiscordMessageData = {
      channelId: defaultChannelId,
      messageId: `discord_orphan_${Date.now()}`,
      content: "这条消息找不到映射",
      authorId: "discord_user_002",
      authorName: "TestUser2",
      isBot: false,
      reference: {
        messageId: "nonexistent_discord_msg_id",
        channelId: defaultChannelId,
      },
      attachments: [],
    };

    const installations = store.getAllInstallations();
    await discordToWx.handleDiscordMessage(discordData, installations);

    // Mock Hub 不应收到任何消息
    const hubMessages = await getMessages();
    expect(hubMessages.length).toBe(0);
  });

  it("非目标频道的 Discord 消息应被忽略", async () => {
    // 先建立映射
    await injectMessage("user_eve", "建立映射");
    await waitFor(async () => discordSentEmbeds.length > 0, 5000);
    const instId = Number(testInstallation.id);
    const link = store.getLatestLinkByWxUser("user_eve", instId);

    // 模拟来自其他频道的消息
    const discordData: DiscordMessageData = {
      channelId: "other_channel_999", // 非默认频道
      messageId: `discord_other_${Date.now()}`,
      content: "来自其他频道",
      authorId: "discord_user_003",
      authorName: "TestUser3",
      isBot: false,
      reference: {
        messageId: link!.discordMessageId,
        channelId: "other_channel_999",
      },
      attachments: [],
    };

    const installations = store.getAllInstallations();
    await discordToWx.handleDiscordMessage(discordData, installations);

    // Mock Hub 不应收到消息（被 channelId 过滤掉）
    const hubMessages = await getMessages();
    expect(hubMessages.length).toBe(0);
  });

  it("没有 reference 的 Discord 消息应被忽略", async () => {
    // 模拟一条没有回复引用的消息
    const discordData: DiscordMessageData = {
      channelId: defaultChannelId,
      messageId: `discord_no_ref_${Date.now()}`,
      content: "这不是一条回复消息",
      authorId: "discord_user_004",
      authorName: "TestUser4",
      isBot: false,
      attachments: [],
    };

    const installations = store.getAllInstallations();
    await discordToWx.handleDiscordMessage(discordData, installations);

    // Mock Hub 不应收到消息
    const hubMessages = await getMessages();
    expect(hubMessages.length).toBe(0);
  });

  // ─── Webhook 验证测试 ───

  it("无效签名的 webhook 请求应被拒绝（401）", async () => {
    const hubEvent = {
      v: 1,
      type: "event",
      trace_id: "tr_bad_sig",
      installation_id: testInstallation.id,
      bot: { id: MOCK_BOT_ID },
      event: {
        type: "message.text",
        id: "evt_bad",
        timestamp: Math.floor(Date.now() / 1000),
        data: {
          sender: { id: "hacker", name: "hacker" },
          content: "恶意消息",
        },
      },
    };

    const res = await fetch(`http://localhost:${APP_PORT}/hub/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Timestamp": "12345",
        "X-Hub-Signature": "invalid_signature_here",
      },
      body: JSON.stringify(hubEvent),
    });

    // 应返回 401
    expect(res.status).toBe(401);

    // Discord 端不应收到任何消息
    expect(discordSentEmbeds.length).toBe(0);
    expect(discordSentTexts.length).toBe(0);
  });

  it("未找到安装记录的 webhook 请求应返回 404", async () => {
    const hubEvent = {
      v: 1,
      type: "event",
      trace_id: "tr_no_inst",
      installation_id: "99999", // 不存在的安装 ID
      bot: { id: MOCK_BOT_ID },
      event: {
        type: "message.text",
        id: "evt_no_inst",
        timestamp: Math.floor(Date.now() / 1000),
        data: {
          sender: { id: "user", name: "user" },
          content: "test",
        },
      },
    };

    const res = await fetch(`http://localhost:${APP_PORT}/hub/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Timestamp": "12345",
        "X-Hub-Signature": "whatever",
      },
      body: JSON.stringify(hubEvent),
    });

    expect(res.status).toBe(404);
  });

  it("url_verification 请求应正确返回 challenge", async () => {
    const verifyEvent = {
      v: 1,
      type: "url_verification",
      challenge: "test_challenge_token_123",
    };

    const res = await fetch(`http://localhost:${APP_PORT}/hub/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(verifyEvent),
    });

    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toEqual({ challenge: "test_challenge_token_123" });
  });

  it("非 POST 方法应返回 405", async () => {
    const res = await fetch(`http://localhost:${APP_PORT}/hub/webhook`, {
      method: "GET",
    });

    expect(res.status).toBe(405);
  });

  // ─── 完整双向链路测试 ───

  it("完整双向链路：微信->Discord->微信", async () => {
    // 步骤 1: 微信用户发消息 -> Hub -> App -> Discord
    await injectMessage("user_frank", "你好，请帮我查个信息");

    await waitFor(async () => discordSentEmbeds.length > 0, 5000);

    // 验证 Discord 端收到消息
    expect(discordSentEmbeds.length).toBe(1);
    const embed = discordSentEmbeds[0].embed;
    expect(embed.data.title).toBe("user_frank");
    expect(embed.data.description).toBe("你好，请帮我查个信息");

    // 步骤 2: Discord 用户回复 -> App -> Hub -> 微信
    const instId = Number(testInstallation.id);
    const link = store.getLatestLinkByWxUser("user_frank", instId);
    expect(link).toBeDefined();

    const replyData: DiscordMessageData = {
      channelId: defaultChannelId,
      messageId: `discord_reply_frank_${Date.now()}`,
      content: "查好了，结果如下...",
      authorId: "discord_user_helper",
      authorName: "HelperUser",
      isBot: false,
      guildId: "test_guild",
      reference: {
        messageId: link!.discordMessageId,
        channelId: defaultChannelId,
      },
      attachments: [],
    };

    const installations = store.getAllInstallations();
    await discordToWx.handleDiscordMessage(replyData, installations);

    // 验证 Mock Hub 收到了回复
    await waitFor(async () => {
      const msgs = await getMessages();
      return msgs.length > 0;
    }, 5000);

    const hubMessages = await getMessages();
    expect(hubMessages.length).toBe(1);
    expect(hubMessages[0].receiver_id).toBe("user_frank");
    expect(hubMessages[0].content).toEqual({ text: "查好了，结果如下..." });
  });
});
