/**
 * Response translator: Vertex AI Gemini -> OpenAI pivot.
 *
 * Pairs with `request/openai-to-vertex.ts`. Vertex returns the same Gemini
 * `candidates` schema as the public API, so it reuses the Gemini decoder
 * verbatim.
 */

export { translateResponse, createStreamTransformer } from "./gemini-to-openai";
