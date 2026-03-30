/**
 * 应用配置接口与加载逻辑
 * 注意：discordBotToken / discordChannelId 在云端托管模式下为可选，
 * 用户会在 OAuth setup 页面自行填写并加密存储到本地数据库。
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
  /** Discord Bot Token（可选，云端托管模式下由用户在安装时填写） */
  discordBotToken: string;
  /** 默认转发到的 Discord 频道 ID（可选） */
  discordChannelId: string;
}

/**
 * 从环境变量加载配置，校验必填项
 */
export function loadConfig(): Config {
  const cfg: Config = {
    port: process.env.PORT ?? "8083",
    hubUrl: process.env.HUB_URL ?? "",
    baseUrl: process.env.BASE_URL ?? "",
    dbPath: process.env.DB_PATH ?? "data/discord.db",
    discordBotToken: process.env.DISCORD_BOT_TOKEN ?? "",
    discordChannelId: process.env.DISCORD_CHANNEL_ID ?? "",
  };

  // 只有 HUB_URL 和 BASE_URL 是必填，Discord 凭证在云端托管模式下由用户安装时填写
  const missing: string[] = [];
  if (!cfg.hubUrl) missing.push("HUB_URL");
  if (!cfg.baseUrl) missing.push("BASE_URL");

  if (missing.length > 0) {
    throw new Error(`缺少必填环境变量: ${missing.join(", ")}`);
  }

  return cfg;
}
