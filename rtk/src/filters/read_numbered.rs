//! `read-numbered` filter — strip line-number padding, drop blank lines.
//!
//! Numbered file reads (`     1→content`) carry padding and blank rows that the
//! model does not need. Output keeps the real line number and the content. See
//! docs/RTK.md §2.

use once_cell::sync::Lazy;
use regex::Regex;

/// `<padding><number><separator><content>` where separator is `→`, `:`, or `|`.
static NUMBERED: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\s*(\d+)[→:|](.*)$").unwrap());

pub fn apply(input: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    for line in input.lines() {
        let Some(caps) = NUMBERED.captures(line) else {
            // Preserve non-numbered lines verbatim so mixed content survives.
            out.push(line.to_string());
            continue;
        };
        let num = &caps[1];
        let content = &caps[2];
        if content.trim().is_empty() {
            continue; // collapse blank rows
        }
        out.push(format!("{num} {content}"));
    }
    out.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "     1→import { z } from \"zod\";\n\
     2→\n\
     3→export const envSchema = z.object({\n\
     4→  JWT_SECRET: z.string().min(32),";

    #[test]
    fn strips_padding_and_blanks() {
        let out = apply(SAMPLE);
        assert_eq!(
            out,
            "1 import { z } from \"zod\";\n\
3 export const envSchema = z.object({\n\
4   JWT_SECRET: z.string().min(32),"
        );
    }

    #[test]
    fn supports_colon_separator() {
        let out = apply("  10:const x = 1;");
        assert_eq!(out, "10 const x = 1;");
    }

    #[test]
    fn empty_input_is_empty() {
        assert_eq!(apply(""), "");
    }
}
