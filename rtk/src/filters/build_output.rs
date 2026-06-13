//! `build-output` filter — drop compiler/bundler progress noise, keep the
//! command result, warnings/errors, and the route/size summary.
//!
//! See docs/RTK.md §2.

use once_cell::sync::Lazy;
use regex::Regex;

static PROGRESS: Lazy<Regex> = Lazy::new(|| Regex::new(r"\((\d+)/(\d+)\)").unwrap());
static PATH: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?:^|\s)(/\S*)").unwrap());
static SIZE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(\d+(?:\.\d+)?)\s*(B|kB|KB|MB|GB)\b").unwrap());

fn detect_cmd(input: &str) -> Option<String> {
    for line in input.lines() {
        if let Some(rest) = line.trim_start().strip_prefix("$ ") {
            return Some(rest.trim().to_string());
        }
    }
    let lower = input.to_lowercase();
    if lower.contains("next build") || lower.contains("optimized production build") {
        return Some("next build".to_string());
    }
    if lower.contains("cargo build") {
        return Some("cargo build".to_string());
    }
    if lower.contains("webpack") {
        return Some("webpack".to_string());
    }
    if lower.contains("error ts") || lower.contains("tsc") {
        return Some("tsc".to_string());
    }
    None
}

fn is_warning_or_error(trimmed: &str) -> bool {
    let lower = trimmed.to_lowercase();
    lower.starts_with("warning")
        || lower.starts_with("error")
        || trimmed.contains("error TS")
        || trimmed.contains("error[")
        || lower.contains("failed to compile")
}

/// Pull the route path and First-Load (last) size from a route-table row.
fn parse_route(line: &str) -> Option<String> {
    let path = PATH.captures(line)?.get(1)?.as_str();
    let last_size = SIZE.captures_iter(line).last()?;
    let size = format!("{}{}", &last_size[1], &last_size[2]);
    Some(format!("{path} {size}"))
}

pub fn apply(input: &str) -> String {
    let cmd = detect_cmd(input);
    let lower = input.to_lowercase();
    let success = lower.contains("compiled successfully")
        || lower.contains("build successful")
        || lower.contains("finished");

    let mut warnings: Vec<String> = Vec::new();
    let mut routes: Vec<String> = Vec::new();
    let mut failed = false;
    let mut in_table = false;

    for line in input.lines() {
        let trimmed = line.trim();
        if trimmed.contains("Route") && trimmed.contains("First Load") {
            in_table = true;
            continue;
        }
        if is_warning_or_error(trimmed) {
            warnings.push(trimmed.to_string());
            let lower = trimmed.to_lowercase();
            if lower.starts_with("error")
                || trimmed.contains("error TS")
                || trimmed.contains("error[")
            {
                failed = true;
            }
            continue;
        }
        if in_table {
            if let Some(route) = parse_route(line) {
                routes.push(route);
            }
        }
    }

    // Max denominator across "(x/N)" progress markers gives the page count.
    let pages = PROGRESS
        .captures_iter(input)
        .filter_map(|c| c[2].parse::<u32>().ok())
        .max();

    let summary = match &cmd {
        Some(cmd) if failed => Some(format!("{cmd}: FAILED")),
        Some(cmd) => match (success, pages) {
            (true, Some(n)) => Some(format!("{cmd}: OK ({n} pages)")),
            (true, None) => Some(format!("{cmd}: OK")),
            (false, Some(n)) => Some(format!("{cmd}: {n} pages")),
            (false, None) => Some(cmd.clone()),
        },
        None => None,
    };

    let mut out: Vec<String> = Vec::new();
    if let Some(s) = summary {
        out.push(s);
    }
    out.extend(warnings);
    if !routes.is_empty() {
        out.push(routes.join(", "));
    }

    if out.is_empty() {
        return input.to_string();
    }
    out.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "$ next build\n\
   Creating an optimized production build ...\n\
 ✓ Compiled successfully\n\
   Collecting page data ...\n\
   Generating static pages (0/24) ...\n\
   Generating static pages (12/24) ...\n\
   Generating static pages (24/24)\n\
 ✓ Finalizing page optimization\n\
Route (app)                Size     First Load JS\n\
┌ ○ /                      5.2 kB   92 kB\n\
├ ○ /dashboard             8.1 kB   110 kB\n\
warning: unused variable `tmp` in src/lib/rtk.ts:42";

    #[test]
    fn summarizes_build() {
        let out = apply(SAMPLE);
        assert_eq!(
            out,
            "next build: OK (24 pages)\n\
warning: unused variable `tmp` in src/lib/rtk.ts:42\n\
/ 92kB, /dashboard 110kB"
        );
    }

    #[test]
    fn non_build_passes_through() {
        let input = "just some text\nwith no build markers";
        assert_eq!(apply(input), input);
    }

    #[test]
    fn empty_input_passes_through() {
        assert_eq!(apply(""), "");
    }
}
