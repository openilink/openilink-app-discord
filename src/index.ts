/**
 * OpeniLink Hub App — Discord Bridge 主入口
 *
 * 微信 ↔ Discord 双向消息桥接 + 19 个 AI Tools
 */

import { createServer, type Server } from "node:http";
import { loadConfig } from "./config.js";
import { Store } from "./store.js";
import { DiscordClient } from "./discord/client.js";
import { registerMessageHandler } from "./discord/event.js";
import { collectAllTools } from "./tools/index.js";
import { Router } from "./router.js";
import { WxToDiscord } from "./bridge/wx-to-discord.js";
import { DiscordToWx } from "./bridge/discord-to-wx.js";
import { HubClient } from "./hub/client.js";
import { handleOAuthSetup, handleOAuthRedirect, handleOAuthNotify, cleanExpired } from "./hub/oauth.js";
import { handleSettingsPage, handleSettingsVerify, handleSettingsSave } from "./hub/settings.js";
import { handleWebhook } from "./hub/webhook.js";
import { getManifest } from "./hub/manifest.js";


/** 按 installation_id 缓存的 per-installation Discord 客户端 */
const discordClientCache = new Map<string, DiscordClient>();

/** 获取或创建 per-installation 的 Discord 客户端（懒启动） */
async function getOrCreateDiscordClient(
  installationId: string,
  botToken: string,
  channelId: string,
  defaultClient: DiscordClient | null,
): Promise<DiscordClient> {
  // 如果没有 installationId 且有默认客户端，直接复用
  if (!installationId && defaultClient) return defaultClient;
  const cached = discordClientCache.get(installationId);
  if (cached) return cached;
  // 如果有凭证则创建新客户端并缓存
  if (botToken) {
    const client = new DiscordClient(botToken, channelId);
    await client.start();
    discordClientCache.set(installationId, client);
    console.log(`[Main] 为安装 ${installationId} 创建了独立的 Discord 客户端`);
    return client;
  }
  // 兜底：使用默认客户端
  if (defaultClient) return defaultClient;
  throw new Error(`[Main] 安装 ${installationId} 缺少 Discord 凭证且无默认客户端`);
}

async function main(): Promise<void> {
  // 1. 加载配置
  const config = loadConfig();

  // 2. 初始化 SQLite 存储
  const store = new Store(config.dbPath);

  // 3. 初始化 Discord 客户端（如果环境变量中配置了 Discord 凭证）
  const hasDiscordCredentials = !!config.discordBotToken;
  let discordClient: DiscordClient | null = null;
  if (hasDiscordCredentials) {
    discordClient = new DiscordClient(config.discordBotToken, config.discordChannelId);
    // 4. 连接 Discord Gateway
    await discordClient.start();
    console.log("[Main] Discord 客户端初始化完成");
  } else {
    console.log("[Main] 未配置 Discord 凭证，跳过默认 Discord 客户端初始化（云端托管模式，用户安装时填写）");
  }

  // 5. 收集所有工具定义和处理器（需要一个 Bot 实例来获取定义，如果没有默认客户端则用空凭证的客户端仅收集定义）
  const toolsSdkClient = discordClient ?? new DiscordClient("", "");
  const { definitions: toolDefinitions, handlers: toolHandlers } =
    collectAllTools(toolsSdkClient.bot);
  console.log(`[Main] 已加载 ${toolDefinitions.length} 个工具`);

  // 6. 初始化命令路由器
  const router = new Router(toolHandlers);

  // 7. 初始化消息桥接（如果有默认 Discord 客户端才启用）
  const wxToDiscord = discordClient ? new WxToDiscord(discordClient, store, config.discordChannelId) : null;
  const discordToWx = discordClient ? new DiscordToWx(store, config.discordChannelId) : null;

  // 8. 注册 Discord 消息监听（Discord → 微信方向，仅在有默认客户端时启用）
  if (discordClient && discordToWx) {
    const _discordToWx = discordToWx;
    registerMessageHandler(discordClient.bot, async (data) => {
      try {
        const installations = store.getAllInstallations();
        await _discordToWx.handleDiscordMessage(data, installations);
      } catch (err) {
        console.error("[Main] Discord → 微信消息处理失败:", err);
      }
    });
  } else {
    console.log("[Main] 未配置 Discord 凭证，跳过消息监听注册");
  }

  // 定期清理过期的 PKCE 缓存
  const cleanupTimer = setInterval(cleanExpired, 60_000);

  // 9. 创建 HTTP 服务
  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const pathname = url.pathname;

    try {
      // Webhook 端点 - command 事件支持同步/异步响应
      if (pathname === "/hub/webhook" && req.method === "POST") {
        await handleWebhook(req, res, store, {
          // 命令事件 - 路由到 tool handler
          onCommand: async (event, installation) => {
            // 读取本地加密存储的用户配置，优先于环境变量
            const userCfg = store.getConfig(installation.id);
            const botToken = userCfg.discord_bot_token || config.discordBotToken;
            const channelId = userCfg.discord_channel_id || config.discordChannelId;

            // 如果用户有自定义凭证，使用 per-installation 缓存客户端
            const instDiscordClient = await getOrCreateDiscordClient(
              installation.id, botToken, channelId, discordClient,
            );

            // 用当前安装对应的 Discord Bot 重新收集 tools handlers
            const { handlers: instHandlers } = collectAllTools(instDiscordClient.bot);
            const instRouter = new Router(instHandlers);

            const hubClient = new HubClient(installation.hubUrl, installation.appToken);
            return instRouter.handleCommand(event, installation, hubClient);
          },
          // 非命令事件（消息桥接等）
          onEvent: async (event, installation) => {
            if (wxToDiscord) {
              await wxToDiscord.handleWxEvent(event, installation);
            }
          },
          // 异步推送回调 - 命令超时后通过 Bot API 推送结果
          onAsyncPush: async (result, event, installation) => {
            const hubClient = new HubClient(installation.hubUrl, installation.appToken);
            const data = event.event?.data ?? {};
            const to = ((data as Record<string, any>).group?.id ?? (data as Record<string, any>).sender?.id ?? (data as Record<string, any>).user_id ?? (data as Record<string, any>).from ?? "") as string;
            if (!to) return;
            const traceId = event.trace_id;
            try {
              if (typeof result === "string") {
                await hubClient.sendText(to, result, traceId);
              } else {
                await hubClient.sendMessage(to, result.type ?? "text", result.reply, {
                  url: result.url,
                  base64: result.base64,
                  filename: result.name,
                  traceId,
                });
              }
            } catch (err) {
              console.error("[Main] 异步推送命令结果失败:", err);
            }
          },
        });
        return;
      }

      // GET/POST /oauth/setup - OAuth 安装流程（显示配置表单 / 提交后跳转授权）
      if (pathname === "/oauth/setup" && (req.method === "GET" || req.method === "POST")) {
        await handleOAuthSetup(req, res, config);
        return;
      }

      // GET /oauth/redirect - OAuth 回调（模式 1）
      // POST /oauth/redirect - Hub 直接安装通知（模式 2）
      if (pathname === "/oauth/redirect") {
        if (req.method === "POST") {
          await handleOAuthNotify(req, res, config, store, toolDefinitions);
          return;
        }
        if (req.method === "GET") {
          await handleOAuthRedirect(req, res, config, store, toolDefinitions);
          return;
        }
      }

      // Manifest 端点
      if (pathname === "/manifest.json" && req.method === "GET") {
        const manifest = getManifest(config, toolDefinitions);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(manifest, null, 2));
        return;
      }

      // GET /settings — 设置页面（输入 token 验证身份）
      if (req.method === "GET" && pathname === "/settings") {
        handleSettingsPage(req, res);
        return;
      }

      // POST /settings/verify — 验证 token 后显示配置表单
      if (req.method === "POST" && pathname === "/settings/verify") {
        await handleSettingsVerify(req, res, config, store);
        return;
      }

      // POST /settings/save — 保存修改后的配置
      if (req.method === "POST" && pathname === "/settings/save") {
        await handleSettingsSave(req, res, config, store);
        return;
      }

      // 健康检查
      if (pathname === "/health" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, version: "0.1.0" }));
        return;
      }

      // 404
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found" }));
    } catch (err) {
      console.error("[Server] 请求处理异常:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal Server Error" }));
      }
    }
  });

  // 10. 优雅退出
  function shutdown(): void {
    console.log("[Server] 正在关闭...");
    clearInterval(cleanupTimer);
    if (discordClient) {
      discordClient.stop().catch((err) => {
        console.error("[Server] 停止 Discord Bot 失败:", err);
      });
    }
    store.close();
    server.close(() => {
      console.log("[Server] 已关闭");
      process.exit(0);
    });
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // 11. 启动 HTTP 服务
  server.listen(Number(config.port), () => {
    console.log(`[Server] Discord Bridge 已启动，监听端口 ${config.port}`);
    console.log(`[Server] Manifest: ${config.baseUrl}/manifest.json`);
    console.log(`[Server] Webhook:  ${config.baseUrl}/hub/webhook`);
  });
}

// 启动应用
main().catch((err) => {
  console.error("[Main] 启动失败:", err);
  process.exit(1);
});
