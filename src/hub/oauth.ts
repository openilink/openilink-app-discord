/**
 * OAuth2 + PKCE 安装流程
 *
 * 流程:
 *   1. Hub 访问 GET /oauth/setup?hub_url=...&app_id=...
 *   2. 生成 PKCE verifier/challenge，缓存 verifier
 *   3. 重定向到 Hub 授权页面
 *   4. 用户授权后 Hub 回调 GET /oauth/redirect?code=...&state=...
 *   5. 用 code + code_verifier 换取 app_token + webhook_secret
 *   6. 保存安装记录
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { generatePKCE } from "../utils/crypto.js";
import type { Store } from "../store.js";
import type { Config } from "../config.js";

/** PKCE 缓存: state → { verifier, hubUrl, appId } */
const pkceCache = new Map<
  string,
  { verifier: string; hubUrl: string; appId: string }
>();

/**
 * 处理 GET /oauth/setup
 * 查询参数: hub_url, app_id
 */
export function handleOAuthSetup(
  req: IncomingMessage,
  res: ServerResponse,
  config: Config,
): void {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const hubUrl = url.searchParams.get("hub_url");
  const appId = url.searchParams.get("app_id");

  if (!hubUrl || !appId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "缺少 hub_url 或 app_id 参数" }));
    return;
  }

  // 生成 PKCE
  const { verifier, challenge } = generatePKCE();

  // 生成随机 state 用于防 CSRF
  const state = crypto.randomUUID();

  // 缓存 verifier，后续回调时需要
  pkceCache.set(state, { verifier, hubUrl, appId });

  // 5 分钟后自动清理缓存
  setTimeout(() => pkceCache.delete(state), 5 * 60 * 1000);

  // 构建 Hub 授权地址
  const redirectUri = `${config.baseUrl}/oauth/redirect`;
  const authorizeUrl = new URL("/oauth/authorize", hubUrl);
  authorizeUrl.searchParams.set("app_id", appId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  // 重定向到 Hub 授权页
  res.writeHead(302, { Location: authorizeUrl.toString() });
  res.end();
}

/**
 * 处理 GET /oauth/redirect
 * 查询参数: code, state
 */
export async function handleOAuthRedirect(
  req: IncomingMessage,
  res: ServerResponse,
  config: Config,
  store: Store,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "缺少 code 或 state 参数" }));
    return;
  }

  // 从缓存中取出 PKCE verifier
  const cached = pkceCache.get(state);
  if (!cached) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "无效或过期的 state" }));
    return;
  }

  // 使用后立即删除
  pkceCache.delete(state);

  try {
    // 用 code + code_verifier 换取 token
    const tokenUrl = new URL("/oauth/token", cached.hubUrl);
    const tokenRes = await fetch(tokenUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        code_verifier: cached.verifier,
        redirect_uri: `${config.baseUrl}/oauth/redirect`,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[OAuth] 换取 token 失败:", tokenRes.status, errText);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "换取 token 失败", detail: errText }));
      return;
    }

    const tokenData = (await tokenRes.json()) as {
      app_token: string;
      webhook_secret: string;
      bot_id: string;
    };

    // 保存安装记录
    const installation = store.saveInstallation({
      hubUrl: cached.hubUrl,
      appId: cached.appId,
      botId: tokenData.bot_id,
      appToken: tokenData.app_token,
      webhookSecret: tokenData.webhook_secret,
    });

    console.log("[OAuth] 安装成功, installation_id:", installation.id);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        message: "安装成功",
        installation_id: installation.id,
      }),
    );
  } catch (err) {
    console.error("[OAuth] 换取 token 异常:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "内部错误" }));
  }
}
