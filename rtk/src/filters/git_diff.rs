//! `git-diff` filter — collapse unchanged hunk context and shrink headers.
//!
//! A unified diff keeps full file headers (`index`, `---`, `+++`) and unchanged
//! context lines around each change. The model only needs to know which file
//! changed, where (the hunk range), and what changed (`+`/`-` lines). See
//! docs/RTK.md §2.

use once_cell::sync::Lazy;
use regex::Regex;

/// Matches a hunk header, capturing the `-a,b +c,d` range and dropping any
/// trailing context that git appends after the second `@@`.
static HUNK: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^@@ (-\d+(?:,\d+)? \+\d+(?:,\d+)?) @@").unwrap());

/// Extract the post-`b/` file path from a `diff --git a/x b/y` line.
fn diff_header_path(line: &str) -> Option<&str> {
    let rest = line.strip_prefix("diff --git ")?;
    // rest = "a/<path> b/<path>"; take the segment after " b/".
    let idx = rest.find(" b/")?;
    Some(&rest[idx + 3..])
}

pub fn apply(input: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut current_file = String::new();

    for line in input.lines() {
        if let Some(path) = diff_header_path(line) {
            current_file = path.to_string();
            continue;
        }
        // Drop the noisy file-metadata lines entirely.
        if line.starts_with("index ")
            || line.starts_with("--- ")
            || line.starts_with("+++ ")
            || line.starts_with("new file mode ")
            || line.starts_with("deleted file mode ")
            || line.starts_with("similarity index ")
            || line.starts_with("rename from ")
            || line.starts_with("rename to ")
        {
            continue;
        }
        if let Some(caps) = HUNK.captures(line) {
            let range = &caps[1];
            if current_file.is_empty() {
                out.push(format!("@@ {range} @@"));
            } else {
                out.push(format!("{current_file} @@ {range} @@"));
            }
            continue;
        }
        // Keep only the actual changes; drop unchanged context (leading space)
        // and the empty separator lines git emits inside a hunk.
        if line.starts_with('+') || line.starts_with('-') {
            out.push(line.to_string());
        }
    }

    out.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "diff --git a/src/lib/auth.ts b/src/lib/auth.ts\n\
index 3f1a2b9..8c4d7e1 100644\n\
--- a/src/lib/auth.ts\n\
+++ b/src/lib/auth.ts\n\
@@ -10,7 +10,7 @@ import { z } from \"zod\";\n\
 const COOKIE_NAME = \"zgate_session\";\n\
 const MAX_AGE = 60 * 60 * 24 * 7;\n\
 \n\
-export function signJwt(payload: JwtPayload) {\n\
+export function signJwt(payload: JwtPayload, opts?: SignOpts) {\n\
   return jwt.sign(payload, env.JWT_SECRET, { expiresIn: MAX_AGE });\n\
 }";

    #[test]
    fn collapses_to_header_and_changes() {
        let out = apply(SAMPLE);
        assert_eq!(
            out,
            "src/lib/auth.ts @@ -10,7 +10,7 @@\n\
-export function signJwt(payload: JwtPayload) {\n\
+export function signJwt(payload: JwtPayload, opts?: SignOpts) {"
        );
    }

    #[test]
    fn empty_input_is_empty() {
        assert_eq!(apply(""), "");
    }

    #[test]
    fn handles_multiple_files() {
        let input = "diff --git a/a.ts b/a.ts\n@@ -1,1 +1,1 @@\n-a\n+b\n\
diff --git a/b.ts b/b.ts\n@@ -2,1 +2,1 @@\n-c\n+d";
        let out = apply(input);
        assert!(out.contains("a.ts @@ -1,1 +1,1 @@"));
        assert!(out.contains("b.ts @@ -2,1 +2,1 @@"));
    }
}
