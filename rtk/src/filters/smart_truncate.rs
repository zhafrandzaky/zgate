//! `smart-truncate` filter — keep head + tail, drop the middle with a marker.
//!
//! The size escalation for oversized no-signature blocks (docs/RTK.md §2/§3).

use crate::CompressOptions;

/// Lines kept at each end.
const KEEP: usize = 100;

pub fn apply(input: &str, _opts: &CompressOptions) -> String {
    let lines: Vec<&str> = input.lines().collect();
    let total = lines.len();
    // Nothing to gain unless we can drop at least one line from the middle.
    if total <= KEEP * 2 + 1 {
        return input.to_string();
    }

    let dropped = total - KEEP * 2;
    let mut out: Vec<String> = Vec::with_capacity(KEEP * 2 + 1);
    out.extend(lines[..KEEP].iter().map(|s| s.to_string()));
    out.push(format!("... [{dropped} lines truncated by RTK] ..."));
    out.extend(lines[total - KEEP..].iter().map(|s| s.to_string()));
    out.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncates_long_content() {
        let input = (1..=5000)
            .map(|n| format!("line {n}"))
            .collect::<Vec<_>>()
            .join("\n");
        let out = apply(&input, &CompressOptions::default());
        assert!(out.contains("... [4800 lines truncated by RTK] ..."));
        assert!(out.starts_with("line 1\n"));
        assert!(out.ends_with("line 5000"));
        assert!(out.len() < input.len());
    }

    #[test]
    fn short_content_unchanged() {
        let input = "a\nb\nc";
        assert_eq!(apply(input, &CompressOptions::default()), input);
    }
}
