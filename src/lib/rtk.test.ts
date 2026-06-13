import { expect, test, describe } from "bun:test";
import { existsSync } from "node:fs";
import { compressRequest, compressRequestWithStats } from "@/src/lib/rtk";
import { env } from "@/src/lib/env";

/** A request whose tool message holds a verbose git diff (> 256 bytes). */
function bigDiffBody(): string {
  let diff = "diff --git a/x.ts b/x.ts\n@@ -1,20 +1,20 @@\n";
  for (let i = 0; i < 20; i++) {
    diff += ` context line ${i} unchanged and intentionally verbose\n`;
  }
  diff += "-removed line for the fixture\n+added line for the fixture\n";
  return JSON.stringify({ messages: [{ role: "tool", content: diff }] });
}

const binaryExists = existsSync(env.RTK_BINARY_PATH);

describe("rtk wrapper", () => {
  test("falls back to the original body when the binary is missing", async () => {
    // Arrange
    const body = bigDiffBody();

    // Act
    const out = await compressRequest(body, { binaryPath: "/nonexistent/rtk-binary" });

    // Assert
    expect(out).toBe(body);
  });

  test("never grows or empties the body on fallback", async () => {
    const body = bigDiffBody();
    const out = await compressRequest(body, { binaryPath: "/nonexistent/rtk-binary" });
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(body.length);
  });

  test.if(binaryExists)("compresses a verbose tool_result via the real binary", async () => {
    // Arrange
    const body = bigDiffBody();

    // Act
    const out = await compressRequest(body);

    // Assert
    expect(out.length).toBeLessThan(body.length);
    const parsed = JSON.parse(out) as { messages: { content: string }[] };
    expect(parsed.messages[0]!.content.length).toBeLessThan(
      (JSON.parse(body) as { messages: { content: string }[] }).messages[0]!.content.length,
    );
  });

  test.if(binaryExists)("returns stats for processed blocks", async () => {
    const result = await compressRequestWithStats(bigDiffBody());
    expect(result.compressed).toBe(true);
    expect(result.stats).not.toBeNull();
    expect(result.stats!.blocks_processed).toBeGreaterThanOrEqual(1);
    expect(result.stats!.filters_applied).toContain("git-diff");
  });

  test.if(binaryExists)("passes short content through untouched", async () => {
    const body = JSON.stringify({ messages: [{ role: "tool", content: "short output" }] });
    const out = await compressRequest(body);
    const parsed = JSON.parse(out) as { messages: { content: string }[] };
    expect(parsed.messages[0]!.content).toBe("short output");
  });
});
