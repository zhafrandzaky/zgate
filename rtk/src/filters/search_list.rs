//! `search-list` filter — summarize a file-finder result with a shared directory
//! prefix and a basename list.
//!
//! See docs/RTK.md §2.

use once_cell::sync::Lazy;
use regex::Regex;

use super::find;

/// A leading `Found N files` / `N results` / `N matches` header.
static HEADER: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^\s*(?:Found\s+)?(\d+)\s+(?:files?|results?|matches?)\b").unwrap());

fn is_path(line: &str) -> bool {
    let t = line.trim();
    !t.is_empty() && !t.contains(char::is_whitespace) && t.contains('/')
}

/// Longest run of leading path segments shared by every path.
fn common_dir(paths: &[Vec<&str>]) -> usize {
    if paths.is_empty() {
        return 0;
    }
    let min_len = paths.iter().map(|p| p.len()).min().unwrap_or(0);
    let mut shared = 0;
    'outer: for i in 0..min_len {
        let first = paths[0][i];
        for p in &paths[1..] {
            if p[i] != first {
                break 'outer;
            }
        }
        shared = i + 1;
    }
    shared
}

pub fn apply(input: &str) -> String {
    let mut explicit_count: Option<usize> = None;
    let mut paths: Vec<&str> = Vec::new();

    for line in input.lines() {
        if let Some(caps) = HEADER.captures(line) {
            explicit_count = caps[1].parse().ok();
            continue;
        }
        if is_path(line) {
            paths.push(line.trim().strip_prefix("./").unwrap_or(line.trim()));
        }
    }

    if paths.is_empty() {
        return input.to_string();
    }

    let split: Vec<Vec<&str>> = paths.iter().map(|p| p.split('/').collect()).collect();
    let shared = common_dir(&split);

    // Need a real shared directory and a remaining basename for every path.
    let usable = shared > 0 && split.iter().all(|s| s.len() > shared);
    let count = explicit_count.unwrap_or(paths.len());

    if usable {
        let dir = split[0][..shared].join("/");
        let basenames: Vec<String> = split.iter().map(|s| s[shared..].join("/")).collect();
        return format!("{count} files in {dir}/: {}", basenames.join(", "));
    }

    // No single shared directory — fall back to brace grouping.
    let owned: Vec<String> = paths.iter().map(|s| s.to_string()).collect();
    find::collapse(&owned).join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "Found 4 files\n\
src/components/auth/LoginForm.tsx\n\
src/components/auth/RegisterForm.tsx\n\
src/components/auth/OtpForm.tsx\n\
src/components/auth/index.ts";

    #[test]
    fn summarizes_with_shared_dir() {
        let out = apply(SAMPLE);
        assert_eq!(
            out,
            "4 files in src/components/auth/: LoginForm.tsx, RegisterForm.tsx, OtpForm.tsx, index.ts"
        );
    }

    #[test]
    fn empty_input_passes_through() {
        assert_eq!(apply(""), "");
    }
}
