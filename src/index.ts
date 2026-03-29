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
import { handleOAuthSetup, handleOAuthRedirect } from "./hub/oauth.js";
import { handleWebhook } from "./hub/webhook.js";
import { getManifest } from "./hub/manifest.js";
import type { HubEvent } from "./hub/types.js";

async function main(): Promise<void> {
  // 1. 加载配置
  const config = loadConfig();

  // 2. 初始化 SQLite 存储
  const store = new Store(config.dbPath);

  // 3. 初始化 Discord 客户端
  const discordClient = new DiscordClient(config.discordBotToken, config.discordChannelId);

  // 4. 连接 Discord Gateway
  await discordClient.start();

  // 5. 收集所有工具定义和处理器
  const { definitions: toolDefinitions, handlers: toolHandlers } =
    collectAllTools(discordClient.bot);
  console.log(`[Main] 已加载 ${toolDefinitions.length} 个工具`);

  // 6. 初始化命令路由器
  const router = new Router(toolHandlers);

  // 7. 初始化消息桥接
  const wxToDiscord = new WxToDiscord(discordClient, store, config.discordChannelId);
  const discordToWx = new DiscordToWx(store, config.discordChannelId);

  // 8. 注册 Discord 消息监听（Discord → 微信方向）
  registerMessageHandler(discordClient.bot, async (data) => {
    try {
      const installations = store.getAllInstallations();
      await discordToWx.handleDiscordMessage(data, installations);
    } catch (err) {
      console.error("[Main] Discord → 微信消息处理失败:", err);
    }
  });

  // Hub 事件回调（微信 → Discord 方向 + 命令路由）
  async function onHubEvent(event: HubEvent): Promise<void> {
    console.log(
      "[Event] 收到事件:",
      event.event?.type ?? event.type,
      "trace_id:",
      event.trace_id,
    );

    const installation = store.getInstallation(event.installation_id);
    if (!installation) {
      console.error(`[Event] 未找到 installation: ${event.installation_id}`);
      return;
    }

    const hubClient = new HubClient(installation);

    // 命令类型事件走路由
    if (event.event?.type === "command") {
      const result = await router.handleCommand(event, installation, hubClient);
      if (result) {
        // 将结果通过 Hub 回复给微信用户
        const data = event.event?.data ?? {};
        const senderId = (data as Record<string, any>).user_id ?? (data as Record<string, any>).from ?? "";
        if (senderId) {
          await hubClient.sendText({ receiverId: senderId as string, content: result });
        }
      }
      return;
    }

    // 其他消息事件走桥接转发
    await wxToDiscord.handleWxEvent(event, installation);
  }

  // 9. 创建 HTTP 服务
  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const pathname = url.pathname;

    try {
      // Webhook 端点
      if (pathname === "/hub/webhook" && req.method === "POST") {
        await handleWebhook(req, res, store, onHubEvent);
        return;
      }

      // OAuth 安装流程
      if (pathname === "/oauth/setup" && req.method === "GET") {
        handleOAuthSetup(req, res, config);
        return;
      }

      if (pathname === "/oauth/redirect" && req.method === "GET") {
        await handleOAuthRedirect(req, res, config, store);
        return;
      }

      // Manifest 端点
      if (pathname === "/manifest.json" && req.method === "GET") {
        const manifest = getManifest(config, toolDefinitions);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(manifest, null, 2));
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
    discordClient.stop().catch((err) => {
      console.error("[Server] 停止 Discord Bot 失败:", err);
    });
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
