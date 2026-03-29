/**
 * 成员工具模块测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { memberTools } from "../../src/tools/members.js";
import { Client, Collection } from "discord.js";

function createMockClient(): any {
  const mockUser = {
    id: "user-001",
    username: "testuser",
    displayName: "TestUser",
    bot: false,
    createdAt: new Date("2023-01-01"),
    avatarURL: vi.fn().mockReturnValue("https://cdn.discord.com/avatar.png"),
    tag: "testuser#0001",
  };

  const mockRole = {
    name: "管理员",
    id: "role-001",
    position: 1,
    hexColor: "#FF0000",
    members: new Collection(),
  };
  const rolesCollection = new Collection();
  rolesCollection.set("role-001", mockRole);

  const mockMember = {
    displayName: "TestUser",
    user: mockUser,
    roles: {
      cache: new Collection([["role-001", { name: "管理员" }]]),
    },
  };

  const membersCollection = new Collection();
  membersCollection.set("user-001", mockMember);

  const mockGuild = {
    name: "测试服务器",
    id: "guild-001",
    ownerId: "owner-001",
    memberCount: 100,
    createdAt: new Date("2023-01-01"),
    description: "测试服务器描述",
    verificationLevel: 1,
    iconURL: vi.fn().mockReturnValue("https://cdn.discord.com/icon.png"),
    fetch: vi.fn().mockImplementation(function(this: any) { return Promise.resolve(this); }),
    members: {
      fetch: vi.fn().mockResolvedValue(membersCollection),
    },
    roles: {
      fetch: vi.fn().mockResolvedValue(rolesCollection),
    },
  };
  // 让 fetch 返回自身
  mockGuild.fetch = vi.fn().mockResolvedValue(mockGuild);

  return {
    users: {
      fetch: vi.fn().mockResolvedValue(mockUser),
    },
    guilds: {
      fetch: vi.fn().mockResolvedValue(mockGuild),
    },
    _mockUser: mockUser,
    _mockGuild: mockGuild,
  };
}

describe("memberTools", () => {
  describe("definitions", () => {
    it("应包含 4 个工具定义", () => {
      expect(memberTools.definitions.length).toBe(4);
    });

    it("应包含 get_user_info 工具", () => {
      const tool = memberTools.definitions.find((d) => d.name === "get_user_info");
      expect(tool).toBeDefined();
      expect(tool!.parameters!.required).toContain("user_id");
    });

    it("应包含 list_members 工具", () => {
      const tool = memberTools.definitions.find((d) => d.name === "list_members");
      expect(tool).toBeDefined();
    });
  });

  describe("handlers", () => {
    let mockClient: any;
    let handlers: Map<string, any>;

    beforeEach(() => {
      mockClient = createMockClient();
      handlers = memberTools.createHandlers(mockClient as unknown as Client);
    });

    it("get_user_info handler 应返回用户信息", async () => {
      const handler = handlers.get("get_user_info");
      expect(handler).toBeDefined();

      const result = await handler!({
        installationId: "1",
        botId: "bot-1",
        userId: "user-1",
        traceId: "trace-1",
        args: { user_id: "user-001" },
      });

      expect(result).toContain("testuser");
    });

    it("list_members handler 应返回成员列表", async () => {
      const handler = handlers.get("list_members");
      expect(handler).toBeDefined();

      const result = await handler!({
        installationId: "1",
        botId: "bot-1",
        userId: "user-1",
        traceId: "trace-1",
        args: { guild_id: "guild-001" },
      });

      expect(result).toContain("测试服务器");
      expect(result).toContain("TestUser");
    });

    it("get_server_info handler 应返回服务器信息", async () => {
      const handler = handlers.get("get_server_info");
      expect(handler).toBeDefined();

      const result = await handler!({
        installationId: "1",
        botId: "bot-1",
        userId: "user-1",
        traceId: "trace-1",
        args: { guild_id: "guild-001" },
      });

      expect(result).toContain("测试服务器");
    });
  });
});
