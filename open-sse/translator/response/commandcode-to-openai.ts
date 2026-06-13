/**
 * Response translator: CommandCode -> OpenAI pivot.
 *
 * Pairs with `request/openai-to-commandcode.ts`. CommandCode returns an
 * Anthropic-Messages-compatible response and event stream, so it reuses the
 * Claude decoder verbatim.
 */

export { translateResponse, createStreamTransformer } from "./claude-to-openai";
