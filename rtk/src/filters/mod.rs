//! Content-specific compression filters.
//!
//! Each filter takes raw tool output and returns a packed version. Filters do
//! not enforce the never-grow / never-empty guarantees themselves — that is done
//! once in [`crate::compress_block`] — but they are written so that a filter
//! applied to content it does not understand degrades gracefully (usually back to
//! the input).

pub mod build_output;
pub mod dedup_log;
pub mod find;
pub mod git_diff;
pub mod git_log;
pub mod git_status;
pub mod grep;
pub mod ls;
pub mod read_numbered;
pub mod search_list;
pub mod smart_truncate;
pub mod tree;

use crate::{CompressOptions, FilterKind};

/// Dispatch a block to the filter for `kind`.
pub fn apply(kind: FilterKind, input: &str, opts: &CompressOptions) -> String {
    match kind {
        FilterKind::GitDiff => git_diff::apply(input),
        FilterKind::GitStatus => git_status::apply(input),
        FilterKind::GitLog => git_log::apply(input),
        FilterKind::Grep => grep::apply(input),
        FilterKind::Find => find::apply(input),
        FilterKind::Ls => ls::apply(input),
        FilterKind::Tree => tree::apply(input),
        FilterKind::DedupLog => dedup_log::apply(input),
        FilterKind::SmartTruncate => smart_truncate::apply(input, opts),
        FilterKind::ReadNumbered => read_numbered::apply(input),
        FilterKind::SearchList => search_list::apply(input),
        FilterKind::BuildOutput => build_output::apply(input),
    }
}
