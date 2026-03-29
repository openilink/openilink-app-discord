/**
 * Hub 客户端测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HubClient } from "../../src/hub/client.js";
import type { Installation } from "../../src/hub/types.js";

// 模拟 fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("HubClient", () => {
  const installation: Installation = {
    id: 1,
    hubUrl: "https://hub.example.com",
    appId: "app-1",
    botId: "bot-1",
    appToken: "token-abc",
    webhookSecret: "secret-xyz",
    createdAt: "2024-01-01T00:00:00Z",
  };

  let client: HubClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new HubClient(installation);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sendText 应调用正确的 API 端点", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    await client.sendText({ receiverId: "wx-user-1", content: "你好" });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/bot/bot-1/message/send");
    expect(options.method).toBe("POST");
  });

  it("sendText 应携带正确的请求头", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    await client.sendText({ receiverId: "wx-user-1", content: "测试" });

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers["Authorization"]).toBe("Bearer token-abc");
    expect(options.headers["Content-Type"]).toBe("application/json");
  });

  it("sendText 应传递正确的消息体", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    await client.sendText({ receiverId: "wx-user-1", content: "Hello" });

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.receiver_id).toBe("wx-user-1");
    expect(body.msg_type).toBe("text");
    expect(body.content.text).toBe("Hello");
  });

  it("sendMessage 应支持自定义消息类型", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    await client.sendMessage({
      receiverId: "wx-user-1",
      msgType: "image",
      content: { image_url: "https://example.com/img.png" },
    });

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.msg_type).toBe("image");
    expect(body.content.image_url).toBe("https://example.com/img.png");
  });

  it("sendText 默认 receiverType 应为 user", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    await client.sendText({ receiverId: "wx-user-1", content: "test" });

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.receiver_type).toBe("user");
  });

  it("网络错误时应返回 ok=false", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const result = await client.sendText({ receiverId: "wx-user-1", content: "fail" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Network error");
  });
});
