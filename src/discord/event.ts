import { Client, Events, Message } from 'discord.js';

/**
 * Discord 消息数据结构
 * 由事件监听器解析后传递给处理函数
 */
export interface DiscordMessageData {
  /** 频道 ID */
  channelId: string;
  /** 消息 ID */
  messageId: string;
  /** 消息文本内容 */
  content: string;
  /** 发送者用户 ID */
  authorId: string;
  /** 发送者用户名 */
  authorName: string;
  /** 是否为 Bot 消息 */
  isBot: boolean;
  /** 服务器 ID（私信时为 undefined） */
  guildId?: string;
  /** 回复的原消息引用信息 */
  reference?: {
    messageId: string;
    channelId: string;
  };
  /** 附件列表 */
  attachments: Array<{
    url: string;
    name: string;
    contentType: string | null;
  }>;
}

/**
 * Discord 消息处理函数类型
 */
export type DiscordMessageHandler = (data: DiscordMessageData) => void | Promise<void>;

/**
 * 注册 Discord 消息监听器
 * 监听 MessageCreate 事件，解析消息数据后调用处理函数
 * 自动忽略 Bot 发送的消息
 *
 * @param client Discord.js Client 实例
 * @param onMessage 消息处理回调函数
 */
export function registerMessageHandler(
  client: Client,
  onMessage: DiscordMessageHandler,
): void {
  client.on(Events.MessageCreate, async (message: Message) => {
    // 忽略 Bot 消息，避免死循环
    if (message.author.bot) {
      return;
    }

    try {
      // 解析附件信息
      const attachments = Array.from(message.attachments.values()).map((att) => ({
        url: att.url,
        name: att.name,
        contentType: att.contentType,
      }));

      // 解析回复引用
      let reference: DiscordMessageData['reference'] | undefined;
      if (message.reference?.messageId && message.reference?.channelId) {
        reference = {
          messageId: message.reference.messageId,
          channelId: message.reference.channelId,
        };
      }

      // 构造标准消息数据
      const data: DiscordMessageData = {
        channelId: message.channelId,
        messageId: message.id,
        content: message.content,
        authorId: message.author.id,
        authorName: message.author.displayName ?? message.author.username,
        isBot: message.author.bot,
        guildId: message.guildId ?? undefined,
        reference,
        attachments,
      };

      console.log(
        `[Discord Event] 收到消息: channelId=${data.channelId}, authorName=${data.authorName}, content=${data.content.substring(0, 50)}${data.content.length > 50 ? '...' : ''}`,
      );

      // 调用处理函数
      await onMessage(data);
    } catch (err) {
      console.error('[Discord Event] 处理消息时出错:', err);
    }
  });

  console.log('[Discord Event] 消息监听器已注册');
}
