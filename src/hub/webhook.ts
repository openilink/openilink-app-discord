/**
 * Hub Webhook 处理
 *
 * Hub 通过 POST /hub/webhook 推送微信消息
 * 签名验证: HMAC-SHA256(secret, timestamp + ":" + body)
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { verifySignature } from "../utils/crypto.js";
import type { Store } from "../store.js";
import type { HubEvent } from "./types.js";

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
 * 处理 Hub Webhook 请求
 * @param onEvent - 收到有效事件后的回调
 */
export async function handleWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  store: Store,
  onEvent: (event: HubEvent) => Promise<void>,
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

  // 签名通过，先回复 200，再异步处理事件
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));

  // 异步处理事件，不阻塞响应
  try {
    await onEvent(hubEvent);
  } catch (err) {
    console.error("[Webhook] 事件处理异常:", err);
  }
}
