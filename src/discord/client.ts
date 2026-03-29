import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  AttachmentBuilder,
  TextChannel,
  Events,
  ChannelType,
} from 'discord.js';

/**
 * Discord SDK 封装类
 * 提供与 Discord API 交互的所有常用方法
 */
export class DiscordClient {
  public bot: Client;
  private token: string;
  private defaultChannelId: string;

  constructor(token: string, defaultChannelId?: string) {
    this.token = token;
    this.defaultChannelId = defaultChannelId ?? '';

    // 创建 Client 实例，配置所需的 Gateway Intents
    this.bot = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ],
    });
  }

  /**
   * 启动 Bot（连接 Gateway WebSocket）
   * 等待 ClientReady 事件后 resolve
   */
  async start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // 监听就绪事件
      this.bot.once(Events.ClientReady, (readyClient) => {
        console.log(`[Discord] Bot 已就绪，登录为 ${readyClient.user.tag}`);
        resolve();
      });

      // 监听错误事件
      this.bot.once('error', (err) => {
        console.error('[Discord] 连接错误:', err);
        reject(err);
      });

      // 调用 login 连接 Gateway
      this.bot.login(this.token).catch((err) => {
        console.error('[Discord] 登录失败:', err);
        reject(err);
      });
    });
  }

  /**
   * 停止 Bot，断开 Gateway 连接
   */
  async stop(): Promise<void> {
    try {
      console.log('[Discord] 正在停止 Bot...');
      await this.bot.destroy();
      console.log('[Discord] Bot 已停止');
    } catch (err) {
      console.error('[Discord] 停止 Bot 失败:', err);
      throw err;
    }
  }

  /**
   * 发送文本消息到指定频道
   * @param channelId 频道 ID，为空时使用默认频道
   * @param text 消息内容
   * @returns 消息 ID
   */
  async sendText(channelId: string, text: string): Promise<string> {
    try {
      const channel = await this.getTextChannel(channelId);
      const message = await channel.send(text);
      console.log(`[Discord] 文本消息已发送至频道 ${channel.id}, messageId=${message.id}`);
      return message.id;
    } catch (err) {
      console.error(`[Discord] 发送文本消息失败 (channelId=${channelId}):`, err);
      throw err;
    }
  }

  /**
   * 发送 Embed 富文本消息
   * @param channelId 频道 ID，为空时使用默认频道
   * @param embed EmbedBuilder 实例
   * @returns 消息 ID
   */
  async sendEmbed(channelId: string, embed: EmbedBuilder): Promise<string> {
    try {
      const channel = await this.getTextChannel(channelId);
      const message = await channel.send({ embeds: [embed] });
      console.log(`[Discord] Embed 消息已发送至频道 ${channel.id}, messageId=${message.id}`);
      return message.id;
    } catch (err) {
      console.error(`[Discord] 发送 Embed 消息失败 (channelId=${channelId}):`, err);
      throw err;
    }
  }

  /**
   * 回复指定消息
   * @param channelId 频道 ID
   * @param messageId 要回复的消息 ID
   * @param text 回复内容
   * @returns 回复消息的 ID
   */
  async replyText(channelId: string, messageId: string, text: string): Promise<string> {
    try {
      const channel = await this.getTextChannel(channelId);
      const targetMessage = await channel.messages.fetch(messageId);
      const reply = await targetMessage.reply(text);
      console.log(`[Discord] 已回复消息 ${messageId}, replyId=${reply.id}`);
      return reply.id;
    } catch (err) {
      console.error(`[Discord] 回复消息失败 (channelId=${channelId}, messageId=${messageId}):`, err);
      throw err;
    }
  }

  /**
   * 上传文件到指定频道
   * @param channelId 频道 ID
   * @param fileBuffer 文件内容 Buffer
   * @param filename 文件名
   * @returns 消息 ID
   */
  async uploadFile(channelId: string, fileBuffer: Buffer, filename: string): Promise<string> {
    try {
      const channel = await this.getTextChannel(channelId);
      const attachment = new AttachmentBuilder(fileBuffer, { name: filename });
      const message = await channel.send({ files: [attachment] });
      console.log(`[Discord] 文件已上传至频道 ${channel.id}, filename=${filename}, messageId=${message.id}`);
      return message.id;
    } catch (err) {
      console.error(`[Discord] 上传文件失败 (channelId=${channelId}, filename=${filename}):`, err);
      throw err;
    }
  }

  /**
   * 给消息添加表情回应
   * @param channelId 频道 ID
   * @param messageId 消息 ID
   * @param emoji 表情符号
   */
  async addReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
    try {
      const channel = await this.getTextChannel(channelId);
      const message = await channel.messages.fetch(messageId);
      await message.react(emoji);
      console.log(`[Discord] 已添加表情 ${emoji} 至消息 ${messageId}`);
    } catch (err) {
      console.error(`[Discord] 添加表情失败 (messageId=${messageId}, emoji=${emoji}):`, err);
      throw err;
    }
  }

  /**
   * 获取频道信息
   * @param channelId 频道 ID
   * @returns 频道对象
   */
  async getChannelInfo(channelId: string): Promise<any> {
    try {
      const resolvedId = channelId || this.defaultChannelId;
      const channel = await this.bot.channels.fetch(resolvedId);
      console.log(`[Discord] 已获取频道信息: ${resolvedId}`);
      return channel;
    } catch (err) {
      console.error(`[Discord] 获取频道信息失败 (channelId=${channelId}):`, err);
      throw err;
    }
  }

  /**
   * 获取消息历史
   * @param channelId 频道 ID
   * @param limit 消息数量限制，默认 50
   * @returns 消息数组
   */
  async getMessages(channelId: string, limit: number = 50): Promise<any[]> {
    try {
      const channel = await this.getTextChannel(channelId);
      const messages = await channel.messages.fetch({ limit });
      const result = Array.from(messages.values());
      console.log(`[Discord] 已获取 ${result.length} 条消息 (channelId=${channel.id})`);
      return result;
    } catch (err) {
      console.error(`[Discord] 获取消息历史失败 (channelId=${channelId}):`, err);
      throw err;
    }
  }

  /**
   * 创建线程
   * @param channelId 频道 ID
   * @param messageId 消息 ID（基于此消息创建线程）
   * @param name 线程名称
   * @returns 线程频道 ID
   */
  async createThread(channelId: string, messageId: string, name: string): Promise<string> {
    try {
      const channel = await this.getTextChannel(channelId);
      const message = await channel.messages.fetch(messageId);
      const thread = await message.startThread({ name });
      console.log(`[Discord] 已创建线程: ${name}, threadId=${thread.id}`);
      return thread.id;
    } catch (err) {
      console.error(`[Discord] 创建线程失败 (messageId=${messageId}, name=${name}):`, err);
      throw err;
    }
  }

  /**
   * 获取服务器（Guild）信息
   * @param guildId 服务器 ID
   * @returns 服务器对象
   */
  async getGuildInfo(guildId: string): Promise<any> {
    try {
      const guild = await this.bot.guilds.fetch(guildId);
      console.log(`[Discord] 已获取服务器信息: ${guild.name} (${guildId})`);
      return guild;
    } catch (err) {
      console.error(`[Discord] 获取服务器信息失败 (guildId=${guildId}):`, err);
      throw err;
    }
  }

  /**
   * 获取服务器成员列表
   * @param guildId 服务器 ID
   * @param limit 成员数量限制，默认 100
   * @returns 成员数组
   */
  async getMembers(guildId: string, limit: number = 100): Promise<any[]> {
    try {
      const guild = await this.bot.guilds.fetch(guildId);
      const members = await guild.members.fetch({ limit });
      const result = Array.from(members.values());
      console.log(`[Discord] 已获取 ${result.length} 个成员 (guildId=${guildId})`);
      return result;
    } catch (err) {
      console.error(`[Discord] 获取服务器成员失败 (guildId=${guildId}):`, err);
      throw err;
    }
  }

  /**
   * 获取用户信息
   * @param userId 用户 ID
   * @returns 用户对象
   */
  async getUserInfo(userId: string): Promise<any> {
    try {
      const user = await this.bot.users.fetch(userId);
      console.log(`[Discord] 已获取用户信息: ${user.tag} (${userId})`);
      return user;
    } catch (err) {
      console.error(`[Discord] 获取用户信息失败 (userId=${userId}):`, err);
      throw err;
    }
  }

  /**
   * 辅助方法：获取文本频道
   * 如果 channelId 为空则使用默认频道
   * @param channelId 频道 ID
   * @returns TextChannel 实例
   */
  private async getTextChannel(channelId: string): Promise<TextChannel> {
    const resolvedId = channelId || this.defaultChannelId;
    if (!resolvedId) {
      throw new Error('[Discord] 未指定频道 ID，且未配置默认频道');
    }

    const channel = await this.bot.channels.fetch(resolvedId);
    if (!channel) {
      throw new Error(`[Discord] 频道不存在: ${resolvedId}`);
    }

    // 检查是否为文本频道（包括普通文本频道和公告频道）
    if (
      channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement &&
      channel.type !== ChannelType.PublicThread &&
      channel.type !== ChannelType.PrivateThread
    ) {
      throw new Error(`[Discord] 频道 ${resolvedId} 不是文本频道 (type=${channel.type})`);
    }

    return channel as TextChannel;
  }
}
