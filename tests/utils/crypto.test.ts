/**
 * 加密工具测试
 */

import { describe, it, expect } from "vitest";
import { verifySignature, generatePKCE } from "../../src/utils/crypto.js";
import { createHmac } from "node:crypto";

describe("verifySignature", () => {
  const secret = "test-webhook-secret";
  const timestamp = "1700000000";
  const body = '{"type":"event","trace_id":"abc"}';

  /** 辅助函数：计算正确的签名 */
  function computeSignature(s: string, ts: string, b: string): string {
    return createHmac("sha256", s).update(`${ts}:${b}`).digest("hex");
  }

  it("正确的签名应返回 true", () => {
    const signature = computeSignature(secret, timestamp, body);
    expect(verifySignature(secret, timestamp, body, signature)).toBe(true);
  });

  it("错误的签名应返回 false", () => {
    expect(verifySignature(secret, timestamp, body, "wrong-signature")).toBe(false);
  });

  it("错误的 secret 应返回 false", () => {
    const signature = computeSignature(secret, timestamp, body);
    expect(verifySignature("wrong-secret", timestamp, body, signature)).toBe(false);
  });

  it("不同的 body 应返回 false", () => {
    const signature = computeSignature(secret, timestamp, body);
    expect(verifySignature(secret, timestamp, "different-body", signature)).toBe(false);
  });

  it("不同的 timestamp 应返回 false", () => {
    const signature = computeSignature(secret, timestamp, body);
    expect(verifySignature(secret, "9999999999", body, signature)).toBe(false);
  });
});

describe("generatePKCE", () => {
  it("应返回 verifier 和 challenge", () => {
    const pkce = generatePKCE();
    expect(pkce).toHaveProperty("verifier");
    expect(pkce).toHaveProperty("challenge");
    expect(typeof pkce.verifier).toBe("string");
    expect(typeof pkce.challenge).toBe("string");
  });

  it("verifier 长度应在合理范围内", () => {
    const pkce = generatePKCE();
    // PKCE 规范要求 43~128 字符
    expect(pkce.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pkce.verifier.length).toBeLessThanOrEqual(128);
  });

  it("challenge 应为 base64url 编码", () => {
    const pkce = generatePKCE();
    // base64url 不包含 +, /, = 字符
    expect(pkce.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("每次调用应生成不同的值", () => {
    const pkce1 = generatePKCE();
    const pkce2 = generatePKCE();
    expect(pkce1.verifier).not.toBe(pkce2.verifier);
    expect(pkce1.challenge).not.toBe(pkce2.challenge);
  });

  it("challenge 应为 SHA-256 摘要的 base64url（43 字符）", () => {
    const pkce = generatePKCE();
    // SHA-256 输出 32 字节 → base64url 编码约 43 字符
    expect(pkce.challenge.length).toBe(43);
  });

  it("相同 verifier 应产生相同 challenge", () => {
    // 通过直接计算验证
    const { createHash } = require("node:crypto");
    const pkce = generatePKCE();
    const expectedChallenge = createHash("sha256")
      .update(pkce.verifier)
      .digest("base64url");
    expect(pkce.challenge).toBe(expectedChallenge);
  });
});
