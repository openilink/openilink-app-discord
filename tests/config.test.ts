/**
 * 配置模块测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  // 保存原始环境变量，测试结束后恢复
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // 设置必填环境变量的默认值
    process.env.HUB_URL = "https://hub.example.com";
    process.env.BASE_URL = "https://app.example.com";
    process.env.DISCORD_BOT_TOKEN = "test-bot-token";
    process.env.DISCORD_CHANNEL_ID = "123456789";
  });

  afterEach(() => {
    // 恢复环境变量
    process.env = { ...originalEnv };
  });

  it("应使用默认端口 8083", () => {
    delete process.env.PORT;
    const config = loadConfig();
    expect(config.port).toBe("8083");
  });

  it("应使用自定义端口", () => {
    process.env.PORT = "9000";
    const config = loadConfig();
    expect(config.port).toBe("9000");
  });

  it("应使用默认数据库路径", () => {
    delete process.env.DB_PATH;
    const config = loadConfig();
    expect(config.dbPath).toBe("data/discord.db");
  });

  it("缺少 HUB_URL 时应抛出错误", () => {
    delete process.env.HUB_URL;
    expect(() => loadConfig()).toThrow("HUB_URL");
  });

  it("缺少 BASE_URL 时应抛出错误", () => {
    delete process.env.BASE_URL;
    expect(() => loadConfig()).toThrow("BASE_URL");
  });

  it("缺少 DISCORD_BOT_TOKEN 时应抛出错误", () => {
    delete process.env.DISCORD_BOT_TOKEN;
    expect(() => loadConfig()).toThrow("DISCORD_BOT_TOKEN");
  });
});
