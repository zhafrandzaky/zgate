/**
 * Cursor executor (docs/PROVIDERS.md "cursor").
 *
 * Proprietary Connect/protobuf protocol over `api2.cursor.sh`. The translator
 * owns the protobuf encode/decode (`cursor` format); the executor sets the
 * Connect transport headers and the imported OAuth bearer. `clientVersion`
 * comes from the connection's provider-specific data (seeded from
 * `OAUTH_CURSOR_CLIENT_VERSION`).
 */

import { BaseExecutor, Format } from "@/open-sse/executors/base";
import type { ExecutorRequest } from "@/open-sse/executors/base";
import { trimTrailingSlash } from "@/open-sse/executors/usageExtractors";

const CURSOR_DEFAULT_BASE = "https://api2.cursor.sh";
const CURSOR_CHAT_PATH = "/aiserver.v1.ChatService/StreamUnifiedChatWithTools";
const CURSOR_DEFAULT_CLIENT_VERSION = "3.1.0";

export class CursorExecutor extends BaseExecutor {
  readonly provider = "cursor";
  readonly format = Format.Cursor;

  override get isOAuth(): boolean {
    return true;
  }

  buildUrl(req: ExecutorRequest): string {
    const base = req.connection.baseUrl?.trim() || CURSOR_DEFAULT_BASE;
    return `${trimTrailingSlash(base)}${CURSOR_CHAT_PATH}`;
  }

  /** Connect/gRPC-web transport, not JSON. */
  protected override baseHeaders(): Record<string, string> {
    return {
      "content-type": "application/connect+proto",
      "connect-protocol-version": "1",
    };
  }

  buildAuthHeaders(req: ExecutorRequest): Record<string, string> {
    const psd = req.connection.credentials.providerSpecificData ?? {};
    // Resolution order: per-connection override -> OAUTH_CURSOR_CLIENT_VERSION
    // env (docs/PROVIDERS.md cursor env var) -> built-in default. The client
    // version is a public, non-secret config value, so reading it from env here
    // is safe and keeps it in sync with .env.example.
    const clientVersion =
      typeof psd.clientVersion === "string"
        ? psd.clientVersion
        : process.env.OAUTH_CURSOR_CLIENT_VERSION || CURSOR_DEFAULT_CLIENT_VERSION;
    const headers: Record<string, string> = { "x-cursor-client-version": clientVersion };
    const token = req.connection.credentials.accessToken;
    if (token) headers.authorization = `Bearer ${token}`;
    return headers;
  }
}
