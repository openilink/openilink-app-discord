/**
 * Manifest 模块测试
 */

import { describe, it, expect } from "vitest";
import { getManifest } from "../../src/hub/manifest.js";
import type { Config } from "../../src/config.js";
import type { ToolDefinition } from "../../src/hub/types.js";

describe("getManifest", () => {
  const config: Config = {
    port: "8083",
    hubUrl: "https://hub.example.com",
    baseUrl: "https://app.example.com",
    dbPath: "data/discord.db",
    discordBotToken: "test-token",
    discordChannelId: "123456",
  };

  it("应包含基本的 slug 和 name", () => {
    const manifest = getManifest(config);
    expect(manifest.slug).toBe("discord-bridge");
    expect(manifest.name).toBe("Discord Bridge");
  });

  it("webhook_url 应指向 /hub/webhook", () => {
    const manifest = getManifest(config);
    expect(manifest.webhook_url).toBe("https://app.example.com/hub/webhook");
  });

  it("oauth 地址应正确配置", () => {
    const manifest = getManifest(config);
    expect(manifest.oauth.setup_url).toBe("https://app.example.com/oauth/setup");
    expect(manifest.oauth.redirect_url).toBe("https://app.example.com/oauth/redirect");
  });

  it("应包含必要的事件类型", () => {
    const manifest = getManifest(config);
    expect(manifest.events).toContain("message");
    expect(manifest.events).toContain("command");
  });

  it("应包含必要的权限范围", () => {
    const manifest = getManifest(config);
    expect(manifest.scopes).toContain("message:read");
    expect(manifest.scopes).toContain("message:write");
  });

  it("传入 tools 时应在 manifest 中包含", () => {
    const tools: ToolDefinition[] = [
      {
        name: "send_discord_message",
        description: "发送消息",
        command: "send_discord_message",
      },
      {
        name: "list_channels",
        description: "列出频道",
        command: "list_channels",
      },
    ];

    const manifest = getManifest(config, tools);
    expect(manifest.tools).toBeDefined();
    expect(manifest.tools!.length).toBe(2);
    expect(manifest.tools![0].name).toBe("send_discord_message");
  });
});
