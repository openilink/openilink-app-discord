/**
 * 存储模块测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Store } from "../src/store.js";
import { unlinkSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Store", () => {
  let store: Store;
  let dbPath: string;

  beforeEach(() => {
    // 使用临时目录中的测试数据库
    const testDir = join(tmpdir(), "openilink-discord-test-" + Date.now());
    mkdirSync(testDir, { recursive: true });
    dbPath = join(testDir, "test.db");
    store = new Store(dbPath);
  });

  afterEach(() => {
    store.close();
    // 清理测试数据库文件
    if (existsSync(dbPath)) unlinkSync(dbPath);
    if (existsSync(dbPath + "-wal")) unlinkSync(dbPath + "-wal");
    if (existsSync(dbPath + "-shm")) unlinkSync(dbPath + "-shm");
  });

  // ========================
  //  Installation 测试
  // ========================

  it("应保存并获取安装记录", () => {
    const inst = store.saveInstallation({
      hubUrl: "https://hub.example.com",
      appId: "app-1",
      botId: "bot-1",
      appToken: "token-abc",
      webhookSecret: "secret-xyz",
    });

    expect(Number(inst.id)).toBeGreaterThan(0);
    expect(inst.hubUrl).toBe("https://hub.example.com");
    expect(inst.appId).toBe("app-1");
  });

  it("应通过 ID 获取安装记录", () => {
    const saved = store.saveInstallation({
      hubUrl: "https://hub.example.com",
      appId: "app-2",
      botId: "bot-2",
      appToken: "token-def",
      webhookSecret: "secret-uvw",
    });

    const found = store.getInstallation(saved.id);
    expect(found).toBeDefined();
    expect(found!.appId).toBe("app-2");
    expect(found!.botId).toBe("bot-2");
  });

  it("获取不存在的安装记录应返回 undefined", () => {
    const result = store.getInstallation(9999);
    expect(result).toBeUndefined();
  });

  it("应获取所有安装记录", () => {
    store.saveInstallation({
      hubUrl: "https://hub1.example.com",
      appId: "app-a",
      botId: "bot-a",
      appToken: "token-1",
      webhookSecret: "secret-1",
    });
    store.saveInstallation({
      hubUrl: "https://hub2.example.com",
      appId: "app-b",
      botId: "bot-b",
      appToken: "token-2",
      webhookSecret: "secret-2",
    });

    const all = store.getAllInstallations();
    expect(all.length).toBe(2);
  });

  // ========================
  //  MessageLink 测试
  // ========================

  it("应保存并通过 Discord 消息 ID 查找消息映射", () => {
    const inst = store.saveInstallation({
      hubUrl: "https://hub.example.com",
      appId: "app-1",
      botId: "bot-1",
      appToken: "token-1",
      webhookSecret: "secret-1",
    });

    store.saveMessageLink({
      installationId: inst.id,
      discordMessageId: "discord-msg-001",
      discordChannelId: "channel-001",
      wxUserId: "wx-user-001",
      wxUserName: "张三",
    });

    const link = store.getMessageLinkByDiscordId("discord-msg-001");
    expect(link).toBeDefined();
    expect(link!.wxUserId).toBe("wx-user-001");
    expect(link!.wxUserName).toBe("张三");
    expect(link!.discordChannelId).toBe("channel-001");
  });

  it("应通过 Discord 消息 ID 查找映射（含频道信息）", () => {
    const inst = store.saveInstallation({
      hubUrl: "https://hub.example.com",
      appId: "app-1",
      botId: "bot-1",
      appToken: "token-1",
      webhookSecret: "secret-1",
    });

    store.saveMessageLink({
      installationId: inst.id,
      discordMessageId: "discord-msg-100",
      discordChannelId: "channel-200",
      wxUserId: "wx-user-100",
      wxUserName: "李四",
    });

    const link = store.getMessageLinkByDiscordId("discord-msg-100");
    expect(link).toBeDefined();
    expect(link!.discordMessageId).toBe("discord-msg-100");
    expect(link!.discordChannelId).toBe("channel-200");
  });

  it("查找不存在的 Discord 消息映射应返回 undefined", () => {
    const result = store.getMessageLinkByDiscordId("non-existent");
    expect(result).toBeUndefined();
  });

  it("应获取某微信用户最近一条映射记录", () => {
    const inst = store.saveInstallation({
      hubUrl: "https://hub.example.com",
      appId: "app-1",
      botId: "bot-1",
      appToken: "token-1",
      webhookSecret: "secret-1",
    });

    store.saveMessageLink({
      installationId: inst.id,
      discordMessageId: "msg-old",
      discordChannelId: "channel-1",
      wxUserId: "wx-user-1",
      wxUserName: "王五",
    });
    store.saveMessageLink({
      installationId: inst.id,
      discordMessageId: "msg-new",
      discordChannelId: "channel-1",
      wxUserId: "wx-user-1",
      wxUserName: "王五",
    });

    const latest = store.getLatestLinkByWxUser("wx-user-1", inst.id);
    expect(latest).toBeDefined();
    expect(latest!.discordMessageId).toBe("msg-new");
  });

  it("获取不存在的微信用户映射应返回 undefined", () => {
    const result = store.getLatestLinkByWxUser("non-existent", 1);
    expect(result).toBeUndefined();
  });
});
