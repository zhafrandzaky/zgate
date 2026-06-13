/**
 * Image part conversion between the inline-base64 and URL representations used
 * by OpenAI, Anthropic, and Gemini.
 *
 *   OpenAI   : { type: "image_url", image_url: { url } }  (url may be a data URL)
 *   Anthropic: { type: "image", source: { type: "base64" | "url", ... } }
 *   Gemini   : { inlineData: { mimeType, data } } | { fileData: { mimeType, fileUri } }
 */

const DATA_URL_RE = /^data:([^;,]+)(;base64)?,(.*)$/s;
const DEFAULT_MEDIA_TYPE = "image/png";

export interface ParsedImage {
  /** True when the source carried inline base64 data rather than a remote URL. */
  isBase64: boolean;
  mediaType: string;
  /** Base64 payload when `isBase64`, otherwise empty. */
  data: string;
  /** Remote URL when not base64, otherwise empty. */
  url: string;
}

/** Parse an OpenAI `image_url.url` (data URL or remote URL) into its parts. */
export function parseImageUrl(url: string): ParsedImage {
  const match = DATA_URL_RE.exec(url);
  if (match) {
    const mediaType = match[1] || DEFAULT_MEDIA_TYPE;
    const isBase64 = Boolean(match[2]);
    const data = match[3] ?? "";
    return { isBase64, mediaType, data: isBase64 ? data : "", url: isBase64 ? "" : url };
  }
  return { isBase64: false, mediaType: DEFAULT_MEDIA_TYPE, data: "", url };
}

// ----------------------------------------------------------------------------
// Anthropic
// ----------------------------------------------------------------------------

export type AnthropicImageSource =
  | { type: "base64"; media_type: string; data: string }
  | { type: "url"; url: string };

export interface AnthropicImageBlock {
  type: "image";
  source: AnthropicImageSource;
}

/** OpenAI image part -> Anthropic image block. */
export function toAnthropicImage(url: string): AnthropicImageBlock {
  const parsed = parseImageUrl(url);
  if (parsed.isBase64) {
    return {
      type: "image",
      source: { type: "base64", media_type: parsed.mediaType, data: parsed.data },
    };
  }
  return { type: "image", source: { type: "url", url: parsed.url } };
}

/** Anthropic image block -> OpenAI `image_url.url`. */
export function fromAnthropicImage(source: AnthropicImageSource): string {
  if (source.type === "base64") {
    return `data:${source.media_type};base64,${source.data}`;
  }
  return source.url;
}

// ----------------------------------------------------------------------------
// Gemini
// ----------------------------------------------------------------------------

export type GeminiImagePart =
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType: string; fileUri: string } };

/** OpenAI image part -> Gemini image part. */
export function toGeminiImage(url: string): GeminiImagePart {
  const parsed = parseImageUrl(url);
  if (parsed.isBase64) {
    return { inlineData: { mimeType: parsed.mediaType, data: parsed.data } };
  }
  return { fileData: { mimeType: parsed.mediaType, fileUri: parsed.url } };
}

/** Gemini image part -> OpenAI `image_url.url`. */
export function fromGeminiImage(part: GeminiImagePart): string {
  if ("inlineData" in part) {
    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
  }
  return part.fileData.fileUri;
}
