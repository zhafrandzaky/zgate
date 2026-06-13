//! `git-log` filter — multi-line commits to one line each.
//!
//! `<short7> <YYYY-MM-DD> <subject>`. See docs/RTK.md §2.

use once_cell::sync::Lazy;
use regex::Regex;

static COMMIT: Lazy<Regex> = Lazy::new(|| Regex::new(r"^commit ([0-9a-f]{7,40})").unwrap());

/// Map a 3-letter English month abbreviation to its 2-digit number.
fn month_num(mon: &str) -> Option<&'static str> {
    Some(match mon {
        "Jan" => "01",
        "Feb" => "02",
        "Mar" => "03",
        "Apr" => "04",
        "May" => "05",
        "Jun" => "06",
        "Jul" => "07",
        "Aug" => "08",
        "Sep" => "09",
        "Oct" => "10",
        "Nov" => "11",
        "Dec" => "12",
        _ => return None,
    })
}

/// Parse `Date:   Mon Jun 9 14:22:31 2026 +0800` into `2026-06-09`.
fn parse_date(line: &str) -> Option<String> {
    let rest = line.strip_prefix("Date:")?.trim();
    let parts: Vec<&str> = rest.split_whitespace().collect();
    // [DayName, Mon, Day, HH:MM:SS, Year, +ZZZZ]
    if parts.len() < 5 {
        return None;
    }
    let month = month_num(parts[1])?;
    let day: u32 = parts[2].parse().ok()?;
    let year: u32 = parts[4].parse().ok()?;
    Some(format!("{year:04}-{month}-{day:02}"))
}

pub fn apply(input: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut short: Option<String> = None;
    let mut date: Option<String> = None;
    let mut waiting_subject = false;

    for line in input.lines() {
        if let Some(caps) = COMMIT.captures(line) {
            short = Some(caps[1][..7.min(caps[1].len())].to_string());
            date = None;
            waiting_subject = false;
            continue;
        }
        if line.starts_with("Author:") || line.starts_with("Merge:") {
            continue;
        }
        if line.starts_with("Date:") {
            date = parse_date(line);
            waiting_subject = true;
            continue;
        }
        if waiting_subject {
            let subject = line.trim();
            if subject.is_empty() {
                continue;
            }
            if let Some(sha) = short.take() {
                let d = date.take().unwrap_or_default();
                if d.is_empty() {
                    out.push(format!("{sha} {subject}"));
                } else {
                    out.push(format!("{sha} {d} {subject}"));
                }
            }
            waiting_subject = false;
        }
    }

    out.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "commit 8c4d7e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d\n\
Author: Ziona <z@ziron.dev>\n\
Date:   Mon Jun 9 14:22:31 2026 +0800\n\
\n\
    feat(auth): add OTP verification\n\
\n\
commit 3f1a2b9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a\n\
Author: Ziona <z@ziron.dev>\n\
Date:   Mon Jun 9 11:02:10 2026 +0800\n\
\n\
    feat(auth): JWT sign/verify helpers";

    #[test]
    fn one_line_per_commit() {
        let out = apply(SAMPLE);
        assert_eq!(
            out,
            "8c4d7e1 2026-06-09 feat(auth): add OTP verification\n\
3f1a2b9 2026-06-09 feat(auth): JWT sign/verify helpers"
        );
    }

    #[test]
    fn parses_date_zero_padded() {
        assert_eq!(
            parse_date("Date:   Mon Jun 9 14:22:31 2026 +0800").unwrap(),
            "2026-06-09"
        );
    }

    #[test]
    fn empty_input_is_empty() {
        assert_eq!(apply(""), "");
    }
}
