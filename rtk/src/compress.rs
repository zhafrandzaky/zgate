//! Request orchestrator.
//!
//! Parses a request body and walks every supported message format, compressing
//! only the `tool_result` text it finds. Everything else — system prompts, user
//! and assistant text, and crucially the provider's output — is left untouched.
//! Blocks marked `is_error` are skipped (docs/RTK.md §1).
//!
//! Supported shapes:
//! - OpenAI chat: `{ "role": "tool", "content": … }`
//! - Anthropic: content block `{ "type": "tool_result", "content": … }`
//! - OpenAI Responses: `{ "type": "function_call_output", "output": … }`
//! - Kiro: `{ "toolResult": { "content": … } }` inside `conversationState`

use serde_json::Value;

use crate::{compress_block, CompressOptions, CompressStats, RtkError};

/// Compress all supported `tool_result` blocks in a request body.
///
/// Returns the rewritten body and per-call stats. A whole-body result that is
/// not smaller than the input is discarded (never-grow at the request level).
pub fn compress_request(
    body: &str,
    opts: &CompressOptions,
) -> Result<(String, CompressStats), RtkError> {
    let mut value: Value =
        serde_json::from_str(body).map_err(|e| RtkError::Parse(e.to_string()))?;
    let mut stats = CompressStats::default();
    walk(&mut value, opts, &mut stats);
    let out = serde_json::to_string(&value).map_err(|e| RtkError::Parse(e.to_string()))?;
    if out.len() <= body.len() {
        Ok((out, stats))
    } else {
        Ok((body.to_string(), stats))
    }
}

/// Recursively walk the JSON tree, compressing recognized tool-result fields.
fn walk(value: &mut Value, opts: &CompressOptions, stats: &mut CompressStats) {
    match value {
        Value::Object(map) => {
            let is_err = matches!(map.get("is_error"), Some(Value::Bool(true)));
            let role_is_tool = map.get("role").and_then(Value::as_str) == Some("tool");
            let type_str = map.get("type").and_then(Value::as_str).map(str::to_string);
            let has_kiro = matches!(map.get("toolResult"), Some(Value::Object(_)));

            // OpenAI `role: tool` and Anthropic `type: tool_result` both carry the
            // payload under `content`; `is_error` blocks are never touched.
            let is_tool_content =
                (role_is_tool || type_str.as_deref() == Some("tool_result")) && !is_err;

            if is_tool_content {
                if let Some(content) = map.get_mut("content") {
                    compress_text_field(content, opts, stats);
                }
            } else if type_str.as_deref() == Some("function_call_output") {
                if let Some(output) = map.get_mut("output") {
                    compress_text_field(output, opts, stats);
                }
            } else if has_kiro {
                if let Some(Value::Object(tr)) = map.get_mut("toolResult") {
                    let tr_err = tr.get("status").and_then(Value::as_str) == Some("error");
                    if !tr_err {
                        if let Some(content) = tr.get_mut("content") {
                            compress_text_field(content, opts, stats);
                        }
                    }
                }
            }

            // Recurse into the rest of the tree (messages arrays, nested input, …).
            for (_, child) in map.iter_mut() {
                walk(child, opts, stats);
            }
        }
        Value::Array(arr) => {
            for item in arr.iter_mut() {
                walk(item, opts, stats);
            }
        }
        _ => {}
    }
}

/// Compress a content field that is a string, or an array of text parts.
fn compress_text_field(value: &mut Value, opts: &CompressOptions, stats: &mut CompressStats) {
    match value {
        Value::String(s) => compress_in_place(s, opts, stats),
        Value::Array(arr) => {
            for part in arr.iter_mut() {
                compress_part(part, opts, stats);
            }
        }
        _ => {}
    }
}

/// Compress one content part: a bare string or a `{ "text": … }` object.
fn compress_part(value: &mut Value, opts: &CompressOptions, stats: &mut CompressStats) {
    match value {
        Value::String(s) => compress_in_place(s, opts, stats),
        Value::Object(map) => {
            if matches!(map.get("text"), Some(Value::String(_))) {
                if let Some(Value::String(s)) = map.get_mut("text") {
                    compress_in_place(s, opts, stats);
                }
            }
        }
        _ => {}
    }
}

/// Compress a single text payload, updating stats. Short payloads are untouched.
fn compress_in_place(s: &mut String, opts: &CompressOptions, stats: &mut CompressStats) {
    if s.len() < opts.min_block_bytes {
        return;
    }
    let (out, kind) = compress_block(s, opts);
    stats.blocks_processed += 1;
    stats.original_bytes += s.len();
    stats.compressed_bytes += out.len();
    if out != *s {
        stats.filters_applied.push(kind);
    }
    *s = out;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::FilterKind;

    /// A diff long enough (> 256 bytes) to clear the min-block threshold.
    fn big_diff() -> String {
        let mut s = String::from("diff --git a/x.ts b/x.ts\nindex 1..2 100644\n--- a/x.ts\n+++ b/x.ts\n@@ -1,20 +1,20 @@\n");
        for i in 0..20 {
            s.push_str(&format!(" unchanged context line number {i} stays put\n"));
        }
        s.push_str("-old line removed here for the test fixture\n");
        s.push_str("+new line added here for the test fixture\n");
        s
    }

    #[test]
    fn compresses_openai_tool_message() {
        let body = serde_json::json!({
            "messages": [
                { "role": "user", "content": "please run git diff" },
                { "role": "tool", "tool_call_id": "call_1", "content": big_diff() }
            ]
        })
        .to_string();

        let (out, stats) = compress_request(&body, &CompressOptions::default()).unwrap();
        let parsed: Value = serde_json::from_str(&out).unwrap();
        let tool_content = parsed["messages"][1]["content"].as_str().unwrap();

        assert!(stats.blocks_processed >= 1);
        assert!(stats.filters_applied.contains(&FilterKind::GitDiff));
        assert!(tool_content.len() < big_diff().len());
        // User text is never touched.
        assert_eq!(parsed["messages"][0]["content"], "please run git diff");
    }

    #[test]
    fn compresses_anthropic_tool_result_array() {
        let body = serde_json::json!({
            "messages": [{
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": "tu_1",
                    "content": [{ "type": "text", "text": big_diff() }]
                }]
            }]
        })
        .to_string();

        let (out, _) = compress_request(&body, &CompressOptions::default()).unwrap();
        let parsed: Value = serde_json::from_str(&out).unwrap();
        let text = parsed["messages"][0]["content"][0]["content"][0]["text"]
            .as_str()
            .unwrap();
        assert!(text.len() < big_diff().len());
    }

    #[test]
    fn skips_is_error_blocks() {
        let original = big_diff();
        let body = serde_json::json!({
            "messages": [{
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "is_error": true,
                    "content": original.clone()
                }]
            }]
        })
        .to_string();

        let (out, stats) = compress_request(&body, &CompressOptions::default()).unwrap();
        let parsed: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(parsed["messages"][0]["content"][0]["content"], original);
        assert_eq!(stats.blocks_processed, 0);
    }

    #[test]
    fn compresses_responses_function_call_output() {
        let body = serde_json::json!({
            "input": [{
                "type": "function_call_output",
                "call_id": "fc_1",
                "output": big_diff()
            }]
        })
        .to_string();

        let (out, _) = compress_request(&body, &CompressOptions::default()).unwrap();
        let parsed: Value = serde_json::from_str(&out).unwrap();
        let output = parsed["input"][0]["output"].as_str().unwrap();
        assert!(output.len() < big_diff().len());
    }

    #[test]
    fn compresses_kiro_tool_result() {
        let body = serde_json::json!({
            "conversationState": {
                "history": [{
                    "toolResult": {
                        "toolUseId": "k1",
                        "status": "success",
                        "content": [{ "text": big_diff() }]
                    }
                }]
            }
        })
        .to_string();

        let (out, _) = compress_request(&body, &CompressOptions::default()).unwrap();
        let parsed: Value = serde_json::from_str(&out).unwrap();
        let text = parsed["conversationState"]["history"][0]["toolResult"]["content"][0]["text"]
            .as_str()
            .unwrap();
        assert!(text.len() < big_diff().len());
    }

    #[test]
    fn rejects_invalid_json() {
        let err = compress_request("}{not json", &CompressOptions::default());
        assert!(matches!(err, Err(RtkError::Parse(_))));
    }

    #[test]
    fn short_content_is_untouched() {
        let body = serde_json::json!({
            "messages": [{ "role": "tool", "content": "short output" }]
        })
        .to_string();
        let (out, stats) = compress_request(&body, &CompressOptions::default()).unwrap();
        let parsed: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(parsed["messages"][0]["content"], "short output");
        assert_eq!(stats.blocks_processed, 0);
    }
}
