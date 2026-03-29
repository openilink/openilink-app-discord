import { EmbedBuilder } from 'discord.js';
import type { DiscordClient } from '../discord/client.js';
import type { HubEvent, Installation, MessageLink } from '../hub/types.js';
import type { Store } from '../store.js';

/**
 * 微信 → Discord 消息转发桥
 * 将从 Hub 收到的微信消息转发到 Discord 频道
 */
export class WxToDiscord {
  private discordClient: DiscordClient;
  private store: Store;
  private defaultChannelId: string;

  constructor(discordClient: DiscordClient, store: Store, defaultChannelId: string) {
    this.discordClient = discordClient;
    this.store = store;
    this.defaultChannelId = defaultChannelId;
  }

  /**
   * 处理从 Hub 收到的微信事件
   * 根据事件类型构造不同格式的 Discord 消息并转发
   *
   * @param event Hub 事件数据
   * @param installation 应用安装信息
   */
  async handleWxEvent(event: HubEvent, installation: Installation): Promise<void> {
    const eventType = event.event?.type;
    const eventData = event.event?.data;

    if (!eventType) {
      console.warn('[WxToDiscord] 事件缺少 type 字段，跳过');
      return;
    }

    // 命令类型事件跳过
    if (eventType === 'command') {
      console.log('[WxToDiscord] 收到 command 事件，跳过');
      return;
    }

    try {
      // 提取发送者信息（eventData 为 Record<string, unknown>，需做类型断言）
      const sender = eventData?.sender as Record<string, unknown> | undefined;
      const senderName = (sender?.name as string) ?? (sender?.alias as string) ?? '未知用户';
      const wxUserId = (sender?.id as string) ?? '';
      const wxUserName = senderName;

      let embed: EmbedBuilder;
      let description: string;

      // 根据消息类型构造不同的描述文本
      switch (eventType) {
        case 'message.text': {
          description = (eventData?.content as string) ?? (eventData?.text as string) ?? '';
          break;
        }
        case 'message.image': {
          description = '[发送了图片]';
          break;
        }
        case 'message.voice': {
          description = '[语音消息]';
          break;
        }
        case 'message.video': {
          description = '[视频消息]';
          break;
        }
        case 'message.file': {
          const fileName = (eventData?.fileName as string) ?? (eventData?.file_name as string) ?? '未知文件';
          description = `[文件: ${fileName}]`;
          break;
        }
        default: {
          description = `[${eventType}消息]`;
          break;
        }
      }

      // 构造 Embed 富文本消息
      embed = new EmbedBuilder()
        .setTitle(senderName)
        .setDescription(description)
        .setColor(0x07c160) // 微信绿色
        .setFooter({ text: '来自微信' })
        .setTimestamp();

      // 发送到 Discord
      const discordMessageId = await this.discordClient.sendEmbed(
        this.defaultChannelId,
        embed,
      );

      console.log(
        `[WxToDiscord] 已转发 ${eventType} 消息至 Discord, discordMessageId=${discordMessageId}, sender=${senderName}`,
      );

      // 保存消息映射关系
      const messageLink: MessageLink = {
        installationId: installation.id,
        discordMessageId,
        discordChannelId: this.defaultChannelId,
        wxUserId,
        wxUserName,
      };

      this.store.saveMessageLink(messageLink);
      console.log(`[WxToDiscord] 消息映射已保存: discord=${discordMessageId} <-> wx=${wxUserId}`);
    } catch (err) {
      console.error(`[WxToDiscord] 转发 ${eventType} 消息失败:`, err);
      throw err;
    }
  }
}
