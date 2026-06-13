import { env } from "@/src/lib/env";

/**
 * RTK (Token Saver) wrapper.
 *
 * Spawns the Rust `rtk` binary (TASK-004, docs/RTK.md §6), pipes the request
 * body in on stdin, and reads the compressed body from stdout. The single hard
 * rule: RTK must never block a request. Any failure — binary missing, crash,
 * timeout, non-zero exit, empty or larger output — falls back to the original
 * body with a logged warning. The engine only ever touches `tool_result` blocks
 * in the input; provider output is never affected.
 */

const RTK_TIMEOUT_MS = 2000;

export interface RtkOptions {
  /** Enable aggressive caveman compression for this request. */
  caveman?: boolean;
  /** Override the binary path (defaults to `env.RTK_BINARY_PATH`). */
  binaryPath?: string;
  /** Override the subprocess timeout (defaults to 2000ms). */
  timeoutMs?: number;
}

export interface RtkStats {
  original_bytes: number;
  compressed_bytes: number;
  blocks_processed: number;
  filters_applied: string[];
}

export interface RtkResult {
  /** The (possibly) compressed body. Always safe to send to the provider. */
  body: string;
  /** True only when RTK actually shrank the body. */
  compressed: boolean;
  /** Stats parsed from the binary's `--stats` output, when available. */
  stats: RtkStats | null;
}

function warn(message: string): void {
  // Non-fatal: surface the fallback without crashing the request path.
  console.warn(`[rtk] ${message}`);
}

/**
 * Compress a request body, returning the original on any failure. Never throws.
 */
export async function compressRequest(body: string, opts: RtkOptions = {}): Promise<string> {
  const result = await runRtk(body, opts);
  return result.body;
}

/**
 * Compress a request body and return the result plus stats. Never throws.
 */
export async function compressRequestWithStats(
  body: string,
  opts: RtkOptions = {},
): Promise<RtkResult> {
  return runRtk(body, opts);
}

function passthrough(body: string): RtkResult {
  return { body, compressed: false, stats: null };
}

async function runRtk(body: string, opts: RtkOptions): Promise<RtkResult> {
  const binaryPath = opts.binaryPath ?? env.RTK_BINARY_PATH;
  const timeoutMs = opts.timeoutMs ?? RTK_TIMEOUT_MS;

  const cmd = [binaryPath, "compress", "--stats"];
  if (opts.caveman) cmd.push("--caveman");

  let proc: Bun.Subprocess<"pipe", "pipe", "pipe">;
  try {
    proc = Bun.spawn(cmd, {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (error: unknown) {
    warn(`spawn failed (${binaryPath}): ${errorMessage(error)} — passing request through`);
    return passthrough(body);
  }

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);

  try {
    proc.stdin.write(body);
    proc.stdin.end();

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (timedOut) {
      warn("subprocess timed out — passing request through");
      return passthrough(body);
    }
    if (exitCode !== 0) {
      warn(`exit code ${exitCode} — passing request through`);
      return passthrough(body);
    }

    // Defense in depth: enforce the engine's never-empty / never-grow contract
    // on the TypeScript side too.
    if (stdout.length === 0 || stdout.length > body.length) {
      return passthrough(body);
    }

    const stats = parseStats(stderr);
    return { body: stdout, compressed: stdout.length < body.length, stats };
  } catch (error: unknown) {
    warn(`subprocess error: ${errorMessage(error)} — passing request through`);
    return passthrough(body);
  } finally {
    clearTimeout(timer);
  }
}

function parseStats(stderr: string): RtkStats | null {
  const line = stderr.trim().split("\n").pop();
  if (!line) return null;
  try {
    const parsed = JSON.parse(line) as Partial<RtkStats>;
    if (typeof parsed.blocks_processed !== "number") return null;
    return {
      original_bytes: parsed.original_bytes ?? 0,
      compressed_bytes: parsed.compressed_bytes ?? 0,
      blocks_processed: parsed.blocks_processed,
      filters_applied: parsed.filters_applied ?? [],
    };
  } catch {
    return null;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
