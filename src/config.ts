/**
 * 应用配置接口与加载逻辑
 */

export interface Config {
  /** HTTP 服务端口，默认 "8083" */
  port: string;
  /** OpeniLink Hub 地址，必填 */
  hubUrl: string;
  /** 本应用的公网基地址，必填（用于 OAuth 回调和 Webhook） */
  baseUrl: string;
  /** SQLite 数据库路径，默认 "data/discord.db" */
  dbPath: string;
  /** Discord Bot Token，必填 */
  discordBotToken: string;
  /** 默认转发到的 Discord 频道 ID */
  discordChannelId: string;
}

/**
 * 从环境变量加载配置，校验必填项
 */
export function loadConfig(): Config {
  const port = process.env.PORT ?? "8083";
  const hubUrl = process.env.HUB_URL ?? "";
  const baseUrl = process.env.BASE_URL ?? "";
  const dbPath = process.env.DB_PATH ?? "data/discord.db";
  const discordBotToken = process.env.DISCORD_BOT_TOKEN ?? "";
  const discordChannelId = process.env.DISCORD_CHANNEL_ID ?? "";

  // 校验必填项
  const missing: string[] = [];
  if (!hubUrl) missing.push("HUB_URL");
  if (!baseUrl) missing.push("BASE_URL");
  if (!discordBotToken) missing.push("DISCORD_BOT_TOKEN");
  if (!discordChannelId) missing.push("DISCORD_CHANNEL_ID");

  if (missing.length > 0) {
    throw new Error(`缺少必填环境变量: ${missing.join(", ")}`);
  }

  return { port, hubUrl, baseUrl, dbPath, discordBotToken, discordChannelId };
}
