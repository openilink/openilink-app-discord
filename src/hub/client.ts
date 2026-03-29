/**
 * Hub Bot API 客户端
 *
 * 用于通过 Hub 向微信发送消息（文本、图片、文件等）
 */

import type { Installation, ToolDefinition } from "./types.js";

/** 发送消息的通用选项 */
interface SendOptions {
  /** 接收者 ID（微信用户/群） */
  receiverId: string;
  /** 接收者类型，默认 "user" */
  receiverType?: "user" | "group";
}

/** Hub API 通用响应 */
interface HubApiResponse {
  ok: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

/** 默认请求超时时间: 30 秒 */
const DEFAULT_TIMEOUT = 30_000;

export class HubClient {
  private installation: Installation;

  constructor(installation: Installation) {
    this.installation = installation;
  }

  /**
   * 将工具定义同步注册到 Hub
   * PUT {hubUrl}/bot/v1/app/tools
   */
  async syncTools(tools: ToolDefinition[]): Promise<void> {
    const url = new URL("/bot/v1/app/tools", this.installation.hubUrl);

    const response = await fetch(url.toString(), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.installation.appToken}`,
      },
      body: JSON.stringify({ tools }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[HubClient] 同步工具定义失败:", response.status, errText);
      throw new Error(`同步工具定义失败: ${response.status} ${errText}`);
    }
    console.log(`[HubClient] 工具定义同步成功, 共 ${tools.length} 个工具`);
  }

  /**
   * 发送文本消息
   */
  async sendText(
    opts: SendOptions & { content: string },
  ): Promise<HubApiResponse> {
    return this.sendMessage({
      receiverId: opts.receiverId,
      receiverType: opts.receiverType,
      msgType: "text",
      content: { text: opts.content },
    });
  }

  /**
   * 发送图片消息
   * @param imageUrl - 图片 URL 或 base64 数据
   */
  async sendImage(
    opts: SendOptions & { imageUrl: string },
  ): Promise<HubApiResponse> {
    return this.sendMessage({
      receiverId: opts.receiverId,
      receiverType: opts.receiverType,
      msgType: "image",
      content: { image_url: opts.imageUrl },
    });
  }

  /**
   * 发送文件消息
   */
  async sendFile(
    opts: SendOptions & { fileUrl: string; fileName: string },
  ): Promise<HubApiResponse> {
    return this.sendMessage({
      receiverId: opts.receiverId,
      receiverType: opts.receiverType,
      msgType: "file",
      content: { file_url: opts.fileUrl, file_name: opts.fileName },
    });
  }

  /**
   * 发送通用消息 — 底层方法
   */
  async sendMessage(payload: {
    receiverId: string;
    receiverType?: "user" | "group";
    msgType: string;
    content: Record<string, unknown>;
  }): Promise<HubApiResponse> {
    const url = new URL(
      `/api/bot/${this.installation.botId}/message/send`,
      this.installation.hubUrl,
    );

    const body = {
      receiver_id: payload.receiverId,
      receiver_type: payload.receiverType ?? "user",
      msg_type: payload.msgType,
      content: payload.content,
    };

    try {
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.installation.appToken}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
      });

      const data = (await response.json()) as HubApiResponse;

      if (!response.ok) {
        console.error(
          "[HubClient] 发送消息失败:",
          response.status,
          JSON.stringify(data),
        );
      }

      return data;
    } catch (err) {
      console.error("[HubClient] 请求异常:", err);
      return { ok: false, error: String(err) };
    }
  }
}
