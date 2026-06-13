//! Caveman mode — aggressive, opt-in post-processing applied after the normal
//! filter (docs/RTK.md §4).
//!
//! Trades readability for tokens: total whitespace collapse, long-decimal
//! rounding, and a shared-path-prefix legend. Off by default. The never-grow /
//! never-empty guard in [`crate::compress_block`] still applies, so a pass that
//! would grow the block is discarded.

use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashMap;

/// Decimals with 3+ fractional digits, e.g. `1.2345678s` → round to 2 places.
static LONG_DECIMAL: Lazy<Regex> = Lazy::new(|| Regex::new(r"\d+\.\d{3,}").unwrap());
/// Runs of 2+ spaces/tabs.
static MULTISPACE: Lazy<Regex> = Lazy::new(|| Regex::new(r"[ \t]{2,}").unwrap());
/// A directory-ish prefix: 2+ segments ending in a slash.
static PATH_PREFIX: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?:[A-Za-z0-9._-]+/){2,}").unwrap());

fn round_decimals(input: &str) -> String {
    LONG_DECIMAL
        .replace_all(input, |caps: &regex::Captures| {
            let raw = &caps[0];
            raw.parse::<f64>()
                .map(|v| format!("{v:.2}"))
                .unwrap_or_else(|_| raw.to_string())
        })
        .into_owned()
}

fn collapse_whitespace(input: &str) -> String {
    input
        .lines()
        .map(|line| MULTISPACE.replace_all(line.trim_end(), " ").into_owned())
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

/// Replace the single most-repeated directory prefix with a `@1` token, prepending
/// one legend line. Only applied when it actually saves bytes.
fn shorten_paths(input: &str) -> String {
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for m in PATH_PREFIX.find_iter(input) {
        *counts.entry(m.as_str()).or_insert(0) += 1;
    }
    let Some((prefix, count)) = counts.into_iter().max_by_key(|&(p, c)| (c, p.len())) else {
        return input.to_string();
    };
    // Worth it only if the prefix repeats and is long enough to beat the legend.
    if count < 2 || prefix.len() <= 4 {
        return input.to_string();
    }
    let token = "@1/";
    let replaced = input.replace(prefix, token);
    let legend = format!("@1={prefix}\n");
    let candidate = format!("{legend}{replaced}");
    if candidate.len() < input.len() {
        candidate
    } else {
        input.to_string()
    }
}

/// Run the full caveman pass.
pub fn apply(input: &str) -> String {
    let step1 = round_decimals(input);
    let step2 = collapse_whitespace(&step1);
    shorten_paths(&step2)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collapses_whitespace_and_blanks() {
        let out = collapse_whitespace("a    b\n\n   \nc");
        assert_eq!(out, "a b\nc");
    }

    #[test]
    fn rounds_long_decimals() {
        assert_eq!(round_decimals("took 1.2345678s"), "took 1.23s");
        assert_eq!(round_decimals("v1.2 stays"), "v1.2 stays");
    }

    #[test]
    fn shortens_repeated_prefix_with_legend() {
        let input = "src/app/api/auth/login\nsrc/app/api/auth/logout\nsrc/app/api/auth/register";
        let out = apply(input);
        assert!(out.starts_with("@1=src/app/api/auth/"));
        assert!(out.contains("@1/login"));
        assert!(out.len() < input.len());
    }

    #[test]
    fn never_empties() {
        assert!(!apply("a\nb\nc").is_empty());
    }
}
