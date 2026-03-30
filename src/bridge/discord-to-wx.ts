import type { DiscordMessageData } from '../discord/event.js';
import type { Installation } from '../hub/types.js';
import type { Store } from '../store.js';
import { HubClient } from '../hub/client.js';

/**
 * Discord → 微信消息转发桥
 * 将 Discord 频道中的消息转发到微信
 */
export class DiscordToWx {
  private store: Store;
  private defaultChannelId: string;

  constructor(store: Store, defaultChannelId: string) {
    this.store = store;
    this.defaultChannelId = defaultChannelId;
  }

  /**
   * 处理 Discord 消息，转发到微信
   *
   * @param data Discord 消息数据
   * @param installations 所有应用安装信息
   */
  async handleDiscordMessage(
    data: DiscordMessageData,
    installations: Installation[],
  ): Promise<void> {
    // 忽略非目标频道的消息（如果配置了默认频道）
    if (this.defaultChannelId && data.channelId !== this.defaultChannelId) {
      console.log(
        `[DiscordToWx] 消息来自非目标频道 ${data.channelId}，跳过（目标频道: ${this.defaultChannelId}）`,
      );
      return;
    }

    // 清理消息内容：去除 Discord @提及格式 <@userId>
    const cleanContent = this.cleanMentions(data.content);

    if (!cleanContent.trim()) {
      console.log('[DiscordToWx] 消息内容为空，跳过');
      return;
    }

    try {
      // 通过回复引用查找目标微信用户
      let targetWxUserId: string | undefined;
      let targetInstallationId: string | undefined;

      if (data.reference?.messageId) {
        // 遍历所有安装实例，查找被回复的消息对应的微信用户
        for (const inst of installations) {
          const link = this.store.getMessageLinkByDiscordId(data.reference.messageId, inst.id);
          if (link) {
            targetWxUserId = link.wxUserId;
            targetInstallationId = link.installationId;
            console.log(
              `[DiscordToWx] 通过回复引用找到目标微信用户: ${link.wxUserName} (${targetWxUserId})`,
            );
            break;
          }
        }
      }

      if (!targetWxUserId || !targetInstallationId) {
        console.warn('[DiscordToWx] 无法确定目标微信用户（消息未回复已知的微信消息），跳过');
        return;
      }

      // 查找对应的 Installation
      const installation = installations.find((inst) => inst.id === targetInstallationId);
      if (!installation) {
        console.error(
          `[DiscordToWx] 未找到 Installation (id=${targetInstallationId})，跳过`,
        );
        return;
      }

      // 使用 HubClient 将消息发送到微信
      const hubClient = new HubClient(installation.hubUrl, installation.appToken);

      await hubClient.sendText(targetWxUserId, cleanContent);

      console.log(
        `[DiscordToWx] 已转发消息至微信: wxUser=${targetWxUserId}, content=${cleanContent.substring(0, 50)}${cleanContent.length > 50 ? '...' : ''}`,
      );
    } catch (err) {
      console.error('[DiscordToWx] 转发消息到微信失败:', err);
      throw err;
    }
  }

  /**
   * 清理 Discord 消息中的 @提及格式
   * 将 <@userId> 和 <@!userId> 替换为空字符串
   *
   * @param content 原始消息内容
   * @returns 清理后的内容
   */
  private cleanMentions(content: string): string {
    // 匹配 <@userId> 和 <@!userId>（带昵称的提及）
    return content.replace(/<@!?\d+>/g, '').trim();
  }
}
