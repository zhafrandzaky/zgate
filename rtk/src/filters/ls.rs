//! `ls` filter — drop the repeated permission/owner columns from `ls -l`.
//!
//! Output: `name size | name size | dir/`. See docs/RTK.md §2.

use once_cell::sync::Lazy;
use regex::Regex;

/// A long-listing row: perms, links, owner, group, size, month, day, time/year,
/// then the name (which may contain spaces).
static ROW: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"^([-dlbcps])[rwxsStT-]{9}[.+]?\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\S+\s+\S+\s+(.+)$",
    )
    .unwrap()
});

/// 1318 -> "1.3K", 18890 -> "18K", 4096 -> "4.0K".
fn human(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "K", "M", "G", "T"];
    if bytes < 1024 {
        return format!("{bytes}B");
    }
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if value < 10.0 {
        format!("{value:.1}{}", UNITS[unit])
    } else {
        format!("{}{}", value.round() as u64, UNITS[unit])
    }
}

pub fn apply(input: &str) -> String {
    let mut entries: Vec<String> = Vec::new();
    for line in input.lines() {
        if line.starts_with("total ") || line.trim().is_empty() {
            continue;
        }
        let Some(caps) = ROW.captures(line) else {
            continue;
        };
        let kind = &caps[1];
        let size: u64 = caps[2].parse().unwrap_or(0);
        let name = caps[3].trim();
        if kind == "d" {
            entries.push(format!("{name}/"));
        } else {
            entries.push(format!("{name} {}", human(size)));
        }
    }
    if entries.is_empty() {
        return input.to_string();
    }
    entries.join(" | ")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "total 48\n\
-rw-r--r-- 1 zyy zyy  1318 Jun 12 01:48 logo.svg\n\
-rw-r--r-- 1 zyy zyy 18890 Jun 12 23:17 UI-UX-DESIGN.md\n\
drwxr-xr-x 2 zyy zyy  4096 Jun 13 01:52 docs";

    #[test]
    fn summarizes_long_listing() {
        let out = apply(SAMPLE);
        assert_eq!(out, "logo.svg 1.3K | UI-UX-DESIGN.md 18K | docs/");
    }

    #[test]
    fn humanizes_sizes() {
        assert_eq!(human(1318), "1.3K");
        assert_eq!(human(18890), "18K");
        assert_eq!(human(900), "900B");
    }

    #[test]
    fn non_ls_passes_through() {
        let input = "not an ls listing";
        assert_eq!(apply(input), input);
    }
}
