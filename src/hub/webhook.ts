/**
 * Hub Webhook 处理
 *
 * Hub 通过 POST /hub/webhook 推送微信消息
 * 签名验证: HMAC-SHA256(secret, timestamp + ":" + body)
 *
 * command 事件实现同步/异步响应模式：
 * - 2500ms 内完成 → HTTP 响应返回 {"reply": "结果"}
 * - 超时 → 立即返回 {"reply_async": true}，后台继续执行并通过 Bot API 推送结果
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { verifySignature } from "../utils/crypto.js";
import type { Store } from "../store.js";
import type { HubEvent, Installation, ToolResult } from "./types.js";

/** 命令处理的 deadline 时间（毫秒） */
const COMMAND_DEADLINE_MS = 2500;

/**
 * 从请求中读取完整 body
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/**
 * 将 ToolHandler 的返回值标准化为 ToolResult
 */
function normalizeResult(raw: string | ToolResult): ToolResult {
  if (typeof raw === "string") {
    return { reply: raw };
  }
  return raw;
}

/**
 * 构建 webhook 同步响应 JSON - 支持纯文本和媒体回复
 */
function buildReplyPayload(result: ToolResult): Record<string, unknown> {
  if (result.type === "image") {
    const payload: Record<string, unknown> = {
      reply: result.reply,
      type: "image",
    };
    if (result.base64) {
      payload.base64 = result.base64;
    } else if (result.url) {
      payload.url = result.url;
    }
    return payload;
  }
  return { reply: result.reply };
}

/**
 * 命令事件处理回调类型
 */
export type CommandCallback = (
  event: HubEvent,
  installation: Installation,
) => Promise<string | ToolResult | null>;

/**
 * 异步推送回调类型 - 命令超时后通过 Bot API 推送结果
 */
export type AsyncPushCallback = (
  result: ToolResult,
  event: HubEvent,
  installation: Installation,
) => Promise<void>;

/** 普通事件回调类型（消息桥接等） */
export type EventCallback = (event: HubEvent, installation: Installation) => Promise<void>;

/**
 * 处理 Hub Webhook 请求
 * @param callbacks.onCommand - 命令事件处理
 * @param callbacks.onEvent - 非命令事件处理（消息桥接等）
 * @param callbacks.onAsyncPush - 命令超时后的异步推送回调
 */
export async function handleWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  store: Store,
  callbacks: {
    onCommand: CommandCallback;
    onEvent: EventCallback;
    onAsyncPush: AsyncPushCallback;
  },
): Promise<void> {
  // 只接受 POST
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method Not Allowed" }));
    return;
  }

  const body = await readBody(req);

  // 解析事件
  let hubEvent: HubEvent;
  try {
    hubEvent = JSON.parse(body) as HubEvent;
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "无效的 JSON" }));
    return;
  }

  // URL 验证请求直接回复 challenge，无需签名验证
  if (hubEvent.type === "url_verification") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ challenge: hubEvent.challenge }));
    return;
  }

  // 签名验证
  const timestamp = req.headers["x-hub-timestamp"] as string | undefined;
  const signature = req.headers["x-hub-signature"] as string | undefined;

  if (!timestamp || !signature) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "缺少签名头" }));
    return;
  }

  // 查找安装记录以获取 webhook_secret
  const installation = store.getInstallation(hubEvent.installation_id);
  if (!installation) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "未找到对应的安装记录" }));
    return;
  }

  // 验证签名
  if (!verifySignature(installation.webhookSecret, timestamp, body, signature)) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "签名验证失败" }));
    return;
  }

  // 根据事件类型分发处理
  const eventType = hubEvent.event?.type;

  if (eventType === "command") {
    // 命令事件 - 实现同步/异步响应模式
    await handleCommandWithDeadline(
      hubEvent,
      installation,
      res,
      callbacks.onCommand,
      callbacks.onAsyncPush,
    );
  } else {
    // 非命令事件 - 先返回 200，再异步处理
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));

    try {
      await callbacks.onEvent(hubEvent, installation);
    } catch (err) {
      console.error("[Webhook] 事件处理异常:", err);
    }
  }
}

/**
 * 带 deadline 的命令处理
 * 在 COMMAND_DEADLINE_MS 内完成则同步返回结果，否则立即返回 reply_async
 */
async function handleCommandWithDeadline(
  event: HubEvent,
  installation: Installation,
  res: ServerResponse,
  onCommand: CommandCallback,
  onAsyncPush: AsyncPushCallback,
): Promise<void> {
  // 启动命令处理
  const commandPromise = onCommand(event, installation);

  // 设置 deadline 定时器
  const timeoutPromise = new Promise<"timeout">((resolve) => {
    setTimeout(() => resolve("timeout"), COMMAND_DEADLINE_MS);
  });

  // 竞争：命令完成 vs 超时
  const raceResult = await Promise.race([
    commandPromise.then((r) => ({ kind: "done" as const, result: r })),
    timeoutPromise.then(() => ({ kind: "timeout" as const, result: null })),
  ]);

  if (raceResult.kind === "done") {
    // 命令在 deadline 内完成 - 同步返回结果
    const raw = raceResult.result;
    if (raw) {
      const result = normalizeResult(raw);
      const payload = buildReplyPayload(result);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    }
  } else {
    // 超时 - 立即返回 reply_async，后台继续执行
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ reply_async: true }));

    // 后台等待命令完成，然后通过 Bot API 推送结果
    commandPromise
      .then(async (raw) => {
        if (raw) {
          const result = normalizeResult(raw);
          await onAsyncPush(result, event, installation);
        }
      })
      .catch((err) => {
        console.error("[Webhook] 异步命令执行失败:", err);
      });
  }
}
