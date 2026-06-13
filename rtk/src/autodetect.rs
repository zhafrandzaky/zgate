//! Content auto-detection.
//!
//! The filter is chosen from the *content* of a tool result, not the tool name —
//! tool names are not reliable across clients. Signatures are scanned in the
//! priority order documented in docs/RTK.md §3. A wrong guess is safe: every
//! filter is never-grow and never-empty.

use once_cell::sync::Lazy;
use regex::Regex;

use crate::FilterKind;

static HUNK: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?m)^@@ -\d").unwrap());
static COMMIT_SHA: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?m)^commit [0-9a-f]{40}\b").unwrap());
static GREP_LINE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[^:\n]+:\d+:").unwrap());
static PATH_LINE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^\.?/?[A-Za-z0-9._-]+(?:/[A-Za-z0-9._@+-]+)+/?$").unwrap());
static LS_ROW: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?m)^[-dlbcps][rwxsStT-]{9}").unwrap());
static NUMBERED_LINE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\s*\d+[→:|]").unwrap());
static SEARCH_HEADER: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^\s*(?:Found\s+)?\d+\s+(?:files?|results?|matches?)\b").unwrap());

/// Fraction of non-empty lines that must match a predicate to count as a
/// "majority".
fn majority<F: Fn(&str) -> bool>(input: &str, pred: F) -> bool {
    let mut total = 0usize;
    let mut hits = 0usize;
    for line in input.lines() {
        if line.trim().is_empty() {
            continue;
        }
        total += 1;
        if pred(line) {
            hits += 1;
        }
    }
    total > 0 && hits * 2 >= total
}

fn looks_like_grep(input: &str) -> bool {
    let mut total = 0usize;
    let mut hits = 0usize;
    for line in input.lines() {
        if line.trim().is_empty() {
            continue;
        }
        total += 1;
        if GREP_LINE.is_match(line) {
            hits += 1;
        }
    }
    // Need at least two matches and a majority to avoid single-colon false hits.
    total > 0 && hits >= 2 && hits * 2 >= total
}

fn has_build_keyword(input: &str) -> bool {
    let lower = input.to_lowercase();
    lower.contains("compiled successfully")
        || lower.contains("optimized production build")
        || lower.contains("webpack")
        || lower.contains("error ts")
        || lower.contains("cargo build")
        || lower.contains("next build")
        || lower.contains("failed to compile")
}

/// Detect the filter for a tool-result block.
///
/// Returns [`FilterKind::DedupLog`] when no signature matches (the documented
/// fallback). [`FilterKind::SmartTruncate`] is never returned here — it is a
/// size escalation handled in [`crate::compress_block`].
pub fn detect(input: &str) -> FilterKind {
    if input.contains("diff --git ") || HUNK.is_match(input) {
        return FilterKind::GitDiff;
    }
    if input.contains("On branch ") || input.contains("Changes to be committed") {
        return FilterKind::GitStatus;
    }
    if COMMIT_SHA.is_match(input) {
        return FilterKind::GitLog;
    }
    if looks_like_grep(input) {
        return FilterKind::Grep;
    }
    if majority(input, |l| PATH_LINE.is_match(l.trim())) {
        // A finder header (`Found N files`) marks search-list; otherwise find.
        if input.lines().any(|l| SEARCH_HEADER.is_match(l)) {
            return FilterKind::SearchList;
        }
        return FilterKind::Find;
    }
    if LS_ROW.is_match(input) {
        return FilterKind::Ls;
    }
    if input.contains("├──") || input.contains("└──") {
        return FilterKind::Tree;
    }
    if majority(input, |l| NUMBERED_LINE.is_match(l)) {
        return FilterKind::ReadNumbered;
    }
    if has_build_keyword(input) {
        return FilterKind::BuildOutput;
    }
    FilterKind::DedupLog
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_git_diff() {
        assert_eq!(
            detect("diff --git a/x b/x\n@@ -1 +1 @@"),
            FilterKind::GitDiff
        );
        assert_eq!(detect("@@ -10,7 +10,7 @@ ctx"), FilterKind::GitDiff);
    }

    #[test]
    fn detects_git_status() {
        assert_eq!(detect("On branch main\n"), FilterKind::GitStatus);
    }

    #[test]
    fn detects_git_log() {
        let s = "commit 8c4d7e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d\nAuthor: x";
        assert_eq!(detect(s), FilterKind::GitLog);
    }

    #[test]
    fn detects_grep() {
        let s = "src/a.ts:1:foo\nsrc/b.ts:2:bar";
        assert_eq!(detect(s), FilterKind::Grep);
    }

    #[test]
    fn detects_find_and_search_list() {
        let find = "src/a/x.ts\nsrc/a/y.ts\nsrc/a/z.ts";
        assert_eq!(detect(find), FilterKind::Find);
        let search = "Found 2 files\nsrc/a/x.ts\nsrc/a/y.ts";
        assert_eq!(detect(search), FilterKind::SearchList);
    }

    #[test]
    fn detects_ls() {
        let s = "total 8\n-rw-r--r-- 1 u u 10 Jan 1 00:00 a.txt";
        assert_eq!(detect(s), FilterKind::Ls);
    }

    #[test]
    fn detects_tree() {
        assert_eq!(detect(".\n├── src\n└── x"), FilterKind::Tree);
    }

    #[test]
    fn detects_read_numbered() {
        let s = "   1→a\n   2→b\n   3→c";
        assert_eq!(detect(s), FilterKind::ReadNumbered);
    }

    #[test]
    fn detects_build_output() {
        let s = "$ next build\n ✓ Compiled successfully";
        assert_eq!(detect(s), FilterKind::BuildOutput);
    }

    #[test]
    fn falls_back_to_dedup_log() {
        assert_eq!(detect("random text\nmore text"), FilterKind::DedupLog);
    }
}
