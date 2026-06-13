//! `find` filter — collapse a long path list into brace-expansion groups.
//!
//! Paths that are identical except for one segment are merged into a single
//! `prefix/{a,b,c}/suffix (N files)` line. See docs/RTK.md §2.

use std::collections::HashMap;

/// Normalize a candidate line into a path, or `None` if it is not path-like.
fn as_path(line: &str) -> Option<&str> {
    let t = line.trim_end();
    if t.is_empty() || t.contains(char::is_whitespace) {
        return None;
    }
    Some(t.strip_prefix("./").unwrap_or(t))
}

/// Collapse a list of paths into brace groups. Shared with `search_list`.
pub fn collapse(paths: &[String]) -> Vec<String> {
    // Bucket by segment count so we only compare structurally similar paths.
    let mut buckets: Vec<usize> = Vec::new();
    let mut by_len: HashMap<usize, Vec<Vec<String>>> = HashMap::new();
    for p in paths {
        let segs: Vec<String> = p.split('/').map(|s| s.to_string()).collect();
        let len = segs.len();
        if !by_len.contains_key(&len) {
            buckets.push(len);
        }
        by_len.entry(len).or_default().push(segs);
    }

    let mut out: Vec<String> = Vec::new();
    for len in buckets {
        let group = &by_len[&len];
        out.extend(collapse_bucket(group, len));
    }
    out
}

/// Find the single varying segment index that groups the most paths and emit
/// the collapsed form for that index.
fn collapse_bucket(group: &[Vec<String>], len: usize) -> Vec<String> {
    if group.len() == 1 {
        return vec![group[0].join("/")];
    }

    // Score each candidate index by how many paths fall into a group of size > 1.
    let mut best_index = None;
    let mut best_score = 0usize;
    for i in 0..len {
        let mut counts: HashMap<String, usize> = HashMap::new();
        for segs in group {
            let key = key_without(segs, i);
            *counts.entry(key).or_insert(0) += 1;
        }
        let score: usize = counts.values().filter(|&&c| c > 1).sum();
        if score > best_score {
            best_score = score;
            best_index = Some(i);
        }
    }

    let Some(i) = best_index else {
        return group.iter().map(|s| s.join("/")).collect();
    };

    // Group by the key, preserving first-appearance order.
    let mut order: Vec<String> = Vec::new();
    let mut groups: HashMap<String, (Vec<String>, Vec<String>)> = HashMap::new();
    for segs in group {
        let key = key_without(segs, i);
        let entry = groups.entry(key.clone()).or_insert_with(|| {
            order.push(key.clone());
            (segs.clone(), Vec::new())
        });
        entry.1.push(segs[i].clone());
    }

    let mut out: Vec<String> = Vec::new();
    for key in order {
        let (template, mut values) = groups.remove(&key).unwrap();
        if values.len() == 1 {
            out.push(template.join("/"));
            continue;
        }
        values.sort();
        values.dedup();
        let mut rebuilt = template.clone();
        rebuilt[i] = format!("{{{}}}", values.join(","));
        out.push(format!("{} ({} files)", rebuilt.join("/"), values.len()));
    }
    out
}

fn key_without(segs: &[String], i: usize) -> String {
    let mut parts: Vec<&str> = Vec::with_capacity(segs.len());
    for (idx, s) in segs.iter().enumerate() {
        if idx == i {
            parts.push("\u{0}");
        } else {
            parts.push(s);
        }
    }
    parts.join("/")
}

pub fn apply(input: &str) -> String {
    let paths: Vec<String> = input
        .lines()
        .filter_map(as_path)
        .map(|s| s.to_string())
        .collect();
    if paths.is_empty() {
        return input.to_string();
    }
    collapse(&paths).join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "./src/app/api/auth/login/route.ts\n\
./src/app/api/auth/logout/route.ts\n\
./src/app/api/auth/register/route.ts\n\
./src/app/api/auth/verify-otp/route.ts";

    #[test]
    fn collapses_single_varying_segment() {
        let out = apply(SAMPLE);
        assert_eq!(
            out,
            "src/app/api/auth/{login,logout,register,verify-otp}/route.ts (4 files)"
        );
    }

    #[test]
    fn keeps_unrelated_paths() {
        let input = "a/b/c.ts\nx/y/z.ts";
        let out = apply(input);
        assert!(out.contains("a/b/c.ts"));
        assert!(out.contains("x/y/z.ts"));
    }

    #[test]
    fn empty_input_passes_through() {
        assert_eq!(apply(""), "");
    }
}
