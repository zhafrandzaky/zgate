import { expect, test, describe } from "bun:test";
import {
  signUserToken,
  verifyUserToken,
  signAdminToken,
  verifyAdminToken,
  SESSION_COOKIE,
  ADMIN_SESSION_COOKIE,
} from "@/src/lib/auth";

describe("auth jwt", () => {
  test("signs and verifies a user token round-trip", async () => {
    // Arrange
    const payload = { sub: "user_123", email: "user@example.com", role: "USER" as const };

    // Act
    const token = await signUserToken(payload);
    const verified = await verifyUserToken(token);

    // Assert
    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe("user_123");
    expect(verified?.email).toBe("user@example.com");
    expect(verified?.role).toBe("USER");
  });

  test("signs and verifies an admin token with ADMIN role", async () => {
    const token = await signAdminToken({
      sub: "admin_1",
      email: "admin@example.com",
      role: "ADMIN",
    });
    const verified = await verifyAdminToken(token);

    expect(verified?.sub).toBe("admin_1");
    expect(verified?.role).toBe("ADMIN");
  });

  test("user verifier rejects an admin token (separate secrets)", async () => {
    const adminToken = await signAdminToken({
      sub: "admin_1",
      email: "admin@example.com",
      role: "ADMIN",
    });

    expect(await verifyUserToken(adminToken)).toBeNull();
  });

  test("admin verifier rejects a user token (separate secrets)", async () => {
    const userToken = await signUserToken({
      sub: "user_1",
      email: "user@example.com",
      role: "USER",
    });

    expect(await verifyAdminToken(userToken)).toBeNull();
  });

  test("returns null for a malformed token", async () => {
    expect(await verifyUserToken("not-a-jwt")).toBeNull();
    expect(await verifyAdminToken("")).toBeNull();
  });

  test("cookie names are distinct for user and admin sessions", () => {
    expect(SESSION_COOKIE).not.toBe(ADMIN_SESSION_COOKIE);
  });
});
