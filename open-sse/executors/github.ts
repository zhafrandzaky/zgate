/**
 * GitHub Copilot executor (docs/PROVIDERS.md "github").
 *
 * OAuth device-code against GitHub; the short-lived Copilot token is exchanged
 * upstream and stored as the access token. Copilot requires integration/editor
 * identification headers or it rejects the request.
 */

import { BaseExecutor, Format } from "@/open-sse/executors/base";
import type { ExecutorRequest } from "@/open-sse/executors/base";
import { trimTrailingSlash } from "@/open-sse/executors/usageExtractors";

const COPILOT_DEFAULT_BASE = "https://api.githubcopilot.com";

export class GithubCopilotExecutor extends BaseExecutor {
  readonly provider = "github";
  readonly format = Format.OpenAI;

  override get isOAuth(): boolean {
    return true;
  }

  buildUrl(req: ExecutorRequest): string {
    const base = req.connection.baseUrl?.trim() || COPILOT_DEFAULT_BASE;
    // Copilot also exposes a Responses API at /responses (docs/PROVIDERS.md
    // github "Responses URL"). Chat Completions is the default; opt into
    // /responses via providerSpecificData.api === "responses". (A Responses-
    // format variant pairs with the openai-responses translator.)
    const psd = req.connection.credentials.providerSpecificData ?? {};
    const path = psd.api === "responses" ? "/responses" : "/chat/completions";
    return `${trimTrailingSlash(base)}${path}`;
  }

  protected override baseHeaders(req: ExecutorRequest): Record<string, string> {
    return {
      ...super.baseHeaders(req),
      "copilot-integration-id": "vscode-chat",
      "editor-version": "vscode/1.96.0",
      "editor-plugin-version": "copilot-chat/0.23.0",
      "openai-intent": "conversation-panel",
    };
  }

  buildAuthHeaders(req: ExecutorRequest): Record<string, string> {
    const token = req.connection.credentials.accessToken;
    return token ? { authorization: `Bearer ${token}` } : {};
  }
}
