/**
 * Hub Webhook 处理测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleWebhook } from "../../src/hub/webhook.js";
import { createHmac } from "node:crypto";
import { IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "node:events";

/** 创建模拟请求 */
function createMockRequest(options: {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = options.method ?? "POST";
  req.url = "/hub/webhook";
  req.headers = {
    host: "localhost:8083",
    ...options.headers,
  };

  // 模拟 body 数据流
  setTimeout(() => {
    if (options.body) {
      req.emit("data", Buffer.from(options.body));
    }
    req.emit("end");
  }, 0);

  return req;
}

/** 创建模拟响应 */
function createMockResponse(): ServerResponse & {
  _statusCode: number;
  _body: string;
  _headers: Record<string, string>;
} {
  const res = {
    _statusCode: 200,
    _body: "",
    _headers: {} as Record<string, string>,
    headersSent: false,
    writeHead(code: number, headers?: Record<string, string>) {
      res._statusCode = code;
      if (headers) {
        Object.assign(res._headers, headers);
      }
      return res;
    },
    end(body?: string) {
      if (body) res._body = body;
      res.headersSent = true;
    },
  } as any;
  return res;
}

/** 辅助：计算签名 */
function computeSignature(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}:${body}`).digest("hex");
}

describe("handleWebhook", () => {
  const mockStore = {
    getInstallation: vi.fn(),
    getAllInstallations: vi.fn(),
    saveInstallation: vi.fn(),
    saveMessageLink: vi.fn(),
    getMessageLinkByDiscordId: vi.fn(),
    getLatestLinkByWxUser: vi.fn(),
    close: vi.fn(),
  };

  const onEvent = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("url_verification 应直接返回 challenge", async () => {
    const body = JSON.stringify({
      type: "url_verification",
      challenge: "test-challenge-123",
    });
    const req = createMockRequest({ body });
    const res = createMockResponse();

    await handleWebhook(req, res, mockStore as any, onEvent);

    expect(res._statusCode).toBe(200);
    expect(JSON.parse(res._body).challenge).toBe("test-challenge-123");
  });

  it("签名正确时应调用 onEvent", async () => {
    const secret = "my-webhook-secret";
    const timestamp = "1700000000";
    const eventBody = JSON.stringify({
      type: "event",
      trace_id: "trace-1",
      installation_id: 1,
      bot: { id: "bot-1" },
      event: { type: "message.text", id: "evt-1", timestamp: 1700000000, data: {} },
    });
    const signature = computeSignature(secret, timestamp, eventBody);

    mockStore.getInstallation.mockReturnValue({
      id: 1,
      webhookSecret: secret,
    });

    const req = createMockRequest({
      body: eventBody,
      headers: {
        "x-hub-timestamp": timestamp,
        "x-hub-signature": signature,
      },
    });
    const res = createMockResponse();

    await handleWebhook(req, res, mockStore as any, onEvent);

    expect(res._statusCode).toBe(200);
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it("签名错误时应返回 401", async () => {
    const eventBody = JSON.stringify({
      type: "event",
      trace_id: "trace-2",
      installation_id: 1,
      bot: { id: "bot-1" },
    });

    mockStore.getInstallation.mockReturnValue({
      id: 1,
      webhookSecret: "correct-secret",
    });

    const req = createMockRequest({
      body: eventBody,
      headers: {
        "x-hub-timestamp": "1700000000",
        "x-hub-signature": "wrong-signature",
      },
    });
    const res = createMockResponse();

    await handleWebhook(req, res, mockStore as any, onEvent);

    expect(res._statusCode).toBe(401);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("缺少签名头时应返回 401", async () => {
    const eventBody = JSON.stringify({
      type: "event",
      trace_id: "trace-3",
      installation_id: 1,
      bot: { id: "bot-1" },
    });

    mockStore.getInstallation.mockReturnValue({ id: 1, webhookSecret: "secret" });

    const req = createMockRequest({ body: eventBody });
    const res = createMockResponse();

    await handleWebhook(req, res, mockStore as any, onEvent);

    expect(res._statusCode).toBe(401);
  });

  it("安装记录不存在时应返回 404", async () => {
    const eventBody = JSON.stringify({
      type: "event",
      trace_id: "trace-4",
      installation_id: 999,
      bot: { id: "bot-1" },
    });

    mockStore.getInstallation.mockReturnValue(undefined);

    const req = createMockRequest({
      body: eventBody,
      headers: {
        "x-hub-timestamp": "1700000000",
        "x-hub-signature": "some-sig",
      },
    });
    const res = createMockResponse();

    await handleWebhook(req, res, mockStore as any, onEvent);

    expect(res._statusCode).toBe(404);
  });

  it("无效 JSON 应返回 400", async () => {
    const req = createMockRequest({ body: "not-json{" });
    const res = createMockResponse();

    await handleWebhook(req, res, mockStore as any, onEvent);

    expect(res._statusCode).toBe(400);
  });
});
