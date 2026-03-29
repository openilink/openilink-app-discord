/**
 * 加密工具 — 签名验证与 PKCE 生成
 */

import { createHmac, randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * 验证 Hub Webhook 签名
 * 签名算法: HMAC-SHA256(secret, timestamp + ":" + body)
 * 使用 timingSafeEqual 防止时序攻击
 */
export function verifySignature(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  const payload = `${timestamp}:${body}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");

  // 长度不一致时也要用 timingSafeEqual 避免泄露信息
  const expectedBuf = Buffer.from(expected, "utf-8");
  const signatureBuf = Buffer.from(signature, "utf-8");

  if (expectedBuf.length !== signatureBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, signatureBuf);
}

/**
 * 生成 PKCE（Proof Key for Code Exchange）参数
 * @returns { verifier, challenge } — verifier 为随机字符串，challenge 为 SHA-256 后的 base64url 编码
 */
export function generatePKCE(): { verifier: string; challenge: string } {
  // 生成 43~128 字符的 code_verifier（这里用 64 字节 → 86 字符 base64url）
  const verifier = randomBytes(64)
    .toString("base64url")
    .slice(0, 128);

  // challenge = BASE64URL(SHA256(verifier))
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64url");

  return { verifier, challenge };
}
