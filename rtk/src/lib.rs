//! ZGate RTK (Token Saver) engine.
//!
//! RTK compresses `tool_result` blocks found in **input** messages before a
//! request is forwarded to a provider. Verbose tool output (git diff, grep, ls,
//! build logs, …) is padded with structure the model does not need; RTK packs it
//! down without dropping information the model relies on. See `docs/RTK.md`.
//!
//! Two safety guarantees hold for every filter and for the whole pipeline:
//!
//! - **Never grow** — if a compressed block is larger than the original, the
//!   original is kept.
//! - **Never empty** — if a filter produces an empty string, the original is
//!   kept.
//!
//! RTK never touches provider output, never touches `is_error` blocks, and any
//! failure is non-fatal: the caller falls back to the unmodified request.

pub mod autodetect;
pub mod caveman;
pub mod compress;
pub mod filters;

use serde::Serialize;
use std::fmt;

pub use autodetect::detect;
pub use compress::compress_request;

/// The compression strategy applied to a single tool-result block.
///
/// `detect` returns the signature-matched variant (or [`FilterKind::DedupLog`]
/// when no signature matches). [`FilterKind::SmartTruncate`] is only reached as a
/// size escalation inside [`compress_block`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum FilterKind {
    GitDiff,
    GitStatus,
    GitLog,
    Grep,
    Find,
    Ls,
    Tree,
    DedupLog,
    SmartTruncate,
    ReadNumbered,
    SearchList,
    BuildOutput,
}

impl FilterKind {
    /// Stable lower-kebab identifier, used in CLI/stats output.
    pub fn as_str(self) -> &'static str {
        match self {
            FilterKind::GitDiff => "git-diff",
            FilterKind::GitStatus => "git-status",
            FilterKind::GitLog => "git-log",
            FilterKind::Grep => "grep",
            FilterKind::Find => "find",
            FilterKind::Ls => "ls",
            FilterKind::Tree => "tree",
            FilterKind::DedupLog => "dedup-log",
            FilterKind::SmartTruncate => "smart-truncate",
            FilterKind::ReadNumbered => "read-numbered",
            FilterKind::SearchList => "search-list",
            FilterKind::BuildOutput => "build-output",
        }
    }
}

impl fmt::Display for FilterKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Tunables for the compression pipeline.
#[derive(Debug, Clone, Copy)]
pub struct CompressOptions {
    /// Enable aggressive caveman post-processing (see `caveman` module).
    pub caveman: bool,
    /// Blocks larger than this (bytes) escalate to smart-truncate when the
    /// detected filter found no real signature. Default 4096.
    pub max_block_bytes: usize,
    /// Blocks smaller than this (bytes) are passed through untouched — the
    /// per-call overhead is not worth it. Default 256.
    pub min_block_bytes: usize,
}

impl Default for CompressOptions {
    fn default() -> Self {
        CompressOptions {
            caveman: false,
            max_block_bytes: 4096,
            min_block_bytes: 256,
        }
    }
}

/// Aggregate stats for one [`compress_request`] call.
#[derive(Debug, Clone, Default, Serialize)]
pub struct CompressStats {
    pub original_bytes: usize,
    pub compressed_bytes: usize,
    pub blocks_processed: u32,
    pub filters_applied: Vec<FilterKind>,
}

/// Failure modes of [`compress_request`]. The CLI maps these to exit code 1 and
/// the caller falls back to the original request body.
#[derive(Debug)]
pub enum RtkError {
    /// The request body was not valid JSON.
    Parse(String),
}

impl fmt::Display for RtkError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RtkError::Parse(msg) => write!(f, "parse error: {msg}"),
        }
    }
}

impl std::error::Error for RtkError {}

/// Compress a single tool-result text block.
///
/// Detects the content type, applies the matching filter, optionally runs the
/// caveman post-pass, then enforces the never-grow / never-empty guarantees. The
/// returned [`FilterKind`] is the strategy actually applied.
pub fn compress_block(input: &str, opts: &CompressOptions) -> (String, FilterKind) {
    let kind = detect(input);

    // Short blocks are not worth the overhead — pass through untouched.
    if input.len() < opts.min_block_bytes {
        return (input.to_string(), kind);
    }

    let mut out = filters::apply(kind, input, opts);
    let mut applied = kind;

    // Fallback escalation: a no-signature block that is still oversized after
    // dedup gets head/tail truncated (docs/RTK.md §3).
    if kind == FilterKind::DedupLog && out.len() > opts.max_block_bytes {
        let truncated = filters::smart_truncate::apply(&out, opts);
        if truncated.len() < out.len() {
            out = truncated;
            applied = FilterKind::SmartTruncate;
        }
    }

    if opts.caveman {
        let cave = caveman::apply(&out);
        if !cave.is_empty() && cave.len() <= out.len() {
            out = cave;
        }
    }

    // Safety guarantees: never empty, never grow.
    if out.is_empty() || out.len() > input.len() {
        return (input.to_string(), applied);
    }

    (out, applied)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_input_passes_through() {
        let opts = CompressOptions::default();
        let input = "tiny";
        let (out, _) = compress_block(input, &opts);
        assert_eq!(out, input);
    }

    #[test]
    fn never_grows_or_empties() {
        let opts = CompressOptions::default();
        // A block of repeated lines well over min_block_bytes.
        let input = "no signature line here\n".repeat(40);
        let (out, _) = compress_block(&input, &opts);
        assert!(!out.is_empty());
        assert!(out.len() <= input.len());
    }

    #[test]
    fn filter_kind_str_roundtrip() {
        assert_eq!(FilterKind::GitDiff.as_str(), "git-diff");
        assert_eq!(FilterKind::SmartTruncate.to_string(), "smart-truncate");
    }

    #[test]
    fn filter_kind_serializes_as_kebab() {
        // The JSON wire form (used by stats) must match `as_str` so the
        // TypeScript wrapper and dashboard see stable filter ids.
        for kind in [
            FilterKind::GitDiff,
            FilterKind::GitStatus,
            FilterKind::GitLog,
            FilterKind::Grep,
            FilterKind::Find,
            FilterKind::Ls,
            FilterKind::Tree,
            FilterKind::DedupLog,
            FilterKind::SmartTruncate,
            FilterKind::ReadNumbered,
            FilterKind::SearchList,
            FilterKind::BuildOutput,
        ] {
            let json = serde_json::to_string(&kind).unwrap();
            assert_eq!(json, format!("\"{}\"", kind.as_str()));
        }
    }
}
