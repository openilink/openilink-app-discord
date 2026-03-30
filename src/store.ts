/**
 * SQLite 存储层 — 使用 better-sqlite3
 * 管理 installations 和 message_links 两张表
 */

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Installation, MessageLink } from "./hub/types.js";
import { encryptConfig, decryptConfig } from "./utils/config-crypto.js";

export class Store {
  private db: Database.Database;

  constructor(dbPath: string) {
    // 确保数据库目录存在
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    // 启用 WAL 模式提升并发性能
    this.db.pragma("journal_mode = WAL");
    this.init();
  }

  /** 初始化表结构 */
  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS installations (
        id               TEXT PRIMARY KEY,
        hub_url          TEXT NOT NULL,
        app_id           TEXT NOT NULL,
        bot_id           TEXT NOT NULL,
        app_token        TEXT NOT NULL,
        webhook_secret   TEXT NOT NULL,
        created_at       TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS message_links (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        installation_id     TEXT NOT NULL,
        discord_message_id  TEXT NOT NULL,
        discord_channel_id  TEXT NOT NULL,
        wx_user_id          TEXT NOT NULL,
        wx_user_name        TEXT NOT NULL DEFAULT '',
        created_at          TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (installation_id) REFERENCES installations(id)
      );

      CREATE INDEX IF NOT EXISTS idx_message_links_discord
        ON message_links(discord_message_id);
      CREATE INDEX IF NOT EXISTS idx_message_links_wx_user
        ON message_links(wx_user_id, installation_id);
    `);

    // 兼容旧库：为 installations 表添加 encrypted_config 列
    try {
      this.db.exec(`ALTER TABLE installations ADD COLUMN encrypted_config TEXT NOT NULL DEFAULT ''`);
    } catch {
      // 列已存在则忽略
    }
  }

  // ========================
  //  Installation CRUD
  // ========================

  /** 保存安装记录（upsert，使用 Hub 返回的 installation_id） */
  saveInstallation(inst: Omit<Installation, "createdAt">): void {
    const stmt = this.db.prepare(`
      INSERT INTO installations (id, hub_url, app_id, bot_id, app_token, webhook_secret)
      VALUES (@id, @hubUrl, @appId, @botId, @appToken, @webhookSecret)
      ON CONFLICT(id) DO UPDATE SET
        hub_url = excluded.hub_url,
        app_id = excluded.app_id,
        bot_id = excluded.bot_id,
        app_token = excluded.app_token,
        webhook_secret = excluded.webhook_secret
    `);
    stmt.run(inst);
  }

  /** 根据 id 获取安装记录 */
  getInstallation(id: string): Installation | undefined {
    const row = this.db.prepare(`
      SELECT id, hub_url, app_id, bot_id, app_token, webhook_secret, created_at
      FROM installations WHERE id = ?
    `).get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToInstallation(row) : undefined;
  }

  /** 获取全部安装记录 */
  getAllInstallations(): Installation[] {
    const rows = this.db.prepare(`
      SELECT id, hub_url, app_id, bot_id, app_token, webhook_secret, created_at
      FROM installations ORDER BY id
    `).all() as Record<string, unknown>[];
    return rows.map((r) => this.rowToInstallation(r));
  }

  // ========================
  //  用户配置（加密存储）
  // ========================

  /** 保存用户配置（AES-256-GCM 加密后存储） */
  saveConfig(installationId: string, config: Record<string, string>): void {
    const encrypted = encryptConfig(JSON.stringify(config));
    this.db.prepare(`UPDATE installations SET encrypted_config = ? WHERE id = ?`)
      .run(encrypted, installationId);
  }

  /** 读取用户配置（从本地解密） */
  getConfig(installationId: string): Record<string, string> {
    const row = this.db
      .prepare("SELECT encrypted_config FROM installations WHERE id = ?")
      .get(installationId) as Record<string, unknown> | undefined;
    if (!row?.encrypted_config) return {};
    try {
      return JSON.parse(decryptConfig(row.encrypted_config as string)) as Record<string, string>;
    } catch {
      return {};
    }
  }

  // ========================
  //  MessageLink CRUD
  // ========================

  /** 保存消息关联记录 */
  saveMessageLink(link: Omit<MessageLink, "id" | "createdAt">): MessageLink {
    const stmt = this.db.prepare(`
      INSERT INTO message_links (installation_id, discord_message_id, discord_channel_id, wx_user_id, wx_user_name)
      VALUES (@installationId, @discordMessageId, @discordChannelId, @wxUserId, @wxUserName)
    `);
    const result = stmt.run(link);
    return {
      ...link,
      id: Number(result.lastInsertRowid),
      createdAt: new Date().toISOString(),
    };
  }

  /** 根据 Discord 消息 ID 和安装实例 ID 获取关联记录 */
  getMessageLinkByDiscordId(discordMessageId: string, installationId: string): MessageLink | undefined {
    const row = this.db.prepare(`
      SELECT id, installation_id, discord_message_id, discord_channel_id, wx_user_id, wx_user_name, created_at
      FROM message_links WHERE discord_message_id = ? AND installation_id = ?
    `).get(discordMessageId, installationId) as Record<string, unknown> | undefined;
    return row ? this.rowToMessageLink(row) : undefined;
  }

  /** 获取某微信用户最近一条关联记录 */
  getLatestLinkByWxUser(wxUserId: string, installationId: string): MessageLink | undefined {
    const row = this.db.prepare(`
      SELECT id, installation_id, discord_message_id, discord_channel_id, wx_user_id, wx_user_name, created_at
      FROM message_links
      WHERE wx_user_id = ? AND installation_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(wxUserId, installationId) as Record<string, unknown> | undefined;
    return row ? this.rowToMessageLink(row) : undefined;
  }

  /** 关闭数据库连接 */
  close(): void {
    this.db.close();
  }

  // ========================
  //  内部辅助方法
  // ========================

  /** 数据库行 → Installation 对象 */
  private rowToInstallation(row: Record<string, unknown>): Installation {
    return {
      id: String(row.id),
      hubUrl: row.hub_url as string,
      appId: row.app_id as string,
      botId: row.bot_id as string,
      appToken: row.app_token as string,
      webhookSecret: row.webhook_secret as string,
      createdAt: row.created_at as string,
    };
  }

  /** 数据库行 → MessageLink 对象 */
  private rowToMessageLink(row: Record<string, unknown>): MessageLink {
    return {
      id: row.id as number,
      installationId: String(row.installation_id),
      discordMessageId: row.discord_message_id as string,
      discordChannelId: row.discord_channel_id as string,
      wxUserId: row.wx_user_id as string,
      wxUserName: row.wx_user_name as string,
      createdAt: row.created_at as string,
    };
  }
}
