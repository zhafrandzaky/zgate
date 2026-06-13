//! `grep` filter — group `path:line:content` matches per file and shorten
//! content that repeats across matches.
//!
//! See docs/RTK.md §2.

use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashMap;

/// `path:line:content` — path has no colon, line is digits.
static MATCH: Lazy<Regex> = Lazy::new(|| Regex::new(r"^([^:\n]+):(\d+):(.*)$").unwrap());

/// Truncate at a word boundary so the result is at most ~`max` chars, then add
/// an ellipsis. Returns `None` when truncating would not actually shorten.
fn shorten(content: &str, max: usize) -> Option<String> {
    let mut acc = String::new();
    for word in content.split(' ') {
        let candidate = if acc.is_empty() {
            word.to_string()
        } else {
            format!("{acc} {word}")
        };
        if candidate.chars().count() > max {
            break;
        }
        acc = candidate;
    }
    if acc.is_empty() {
        return None;
    }
    let truncated = format!("{acc} …");
    if truncated.len() < content.len() {
        Some(truncated)
    } else {
        None
    }
}

pub fn apply(input: &str) -> String {
    // Parse into (path, line, content); keep file order of first appearance.
    let mut order: Vec<String> = Vec::new();
    let mut by_file: HashMap<String, Vec<(String, String)>> = HashMap::new();
    let mut content_count: HashMap<String, usize> = HashMap::new();

    for raw in input.lines() {
        let Some(caps) = MATCH.captures(raw) else {
            // Not a grep line; bail out to a no-op so the safety guard keeps the
            // original (mixed content is not ours to mangle).
            return input.to_string();
        };
        let path = caps[1].to_string();
        let lineno = caps[2].to_string();
        let content = caps[3].trim_start().to_string();
        *content_count.entry(content.clone()).or_insert(0) += 1;
        if !by_file.contains_key(&path) {
            order.push(path.clone());
        }
        by_file.entry(path).or_default().push((lineno, content));
    }

    let mut out: Vec<String> = Vec::new();
    for path in &order {
        let entries = &by_file[path];
        let parts: Vec<String> = entries
            .iter()
            .map(|(lineno, content)| {
                let shown = if content_count.get(content).copied().unwrap_or(0) > 1 {
                    shorten(content, 16).unwrap_or_else(|| content.clone())
                } else {
                    content.clone()
                };
                format!("{lineno} {shown}")
            })
            .collect();
        out.push(format!("{path}: {}", parts.join("; ")));
    }

    out.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "src/lib/auth.ts:12:import { env } from \"@/lib/env\";\n\
src/lib/auth.ts:48:  const secret = env.JWT_SECRET;\n\
src/lib/otp.ts:3:import { env } from \"@/lib/env\";\n\
src/lib/otp.ts:21:  const ttl = env.OTP_EXPIRY_MINUTES * 60;";

    #[test]
    fn groups_and_truncates_duplicates() {
        let out = apply(SAMPLE);
        assert_eq!(
            out,
            "src/lib/auth.ts: 12 import { env } …; 48 const secret = env.JWT_SECRET;\n\
src/lib/otp.ts: 3 import { env } …; 21 const ttl = env.OTP_EXPIRY_MINUTES * 60;"
        );
    }

    #[test]
    fn non_grep_input_passes_through() {
        let input = "just a plain line\nanother";
        assert_eq!(apply(input), input);
    }

    #[test]
    fn empty_input_is_empty() {
        assert_eq!(apply(""), "");
    }
}
