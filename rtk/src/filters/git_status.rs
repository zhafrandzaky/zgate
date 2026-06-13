//! `git-status` filter — verbose `git status` to a porcelain-style summary.
//!
//! See docs/RTK.md §2.

/// Which section of the status output we are currently parsing.
#[derive(Clone, Copy, PartialEq)]
enum Section {
    None,
    Staged,
    Unstaged,
    Untracked,
}

/// Map a `modified:` / `new file:` / … label to a single-letter code.
fn status_code(label: &str) -> &'static str {
    match label {
        "new file" => "A",
        "modified" => "M",
        "deleted" => "D",
        "renamed" => "R",
        "copied" => "C",
        "typechange" => "T",
        _ => "?",
    }
}

/// Parse a `        modified:   path` entry into `"M path"`.
fn parse_change(line: &str) -> Option<String> {
    let trimmed = line.trim_start();
    let colon = trimmed.find(':')?;
    let label = trimmed[..colon].trim();
    let rest = trimmed[colon + 1..].trim();
    if rest.is_empty() {
        return None;
    }
    let code = status_code(label);
    if code == "?" {
        return None;
    }
    // Renames are "old -> new"; keep the new path.
    let path = rest.rsplit(" -> ").next().unwrap_or(rest);
    Some(format!("{code} {path}"))
}

pub fn apply(input: &str) -> String {
    let mut branch_line: Option<String> = None;
    let mut tracking: Option<String> = None;
    let mut staged: Vec<String> = Vec::new();
    let mut unstaged: Vec<String> = Vec::new();
    let mut untracked: Vec<String> = Vec::new();
    let mut section = Section::None;

    for line in input.lines() {
        if let Some(branch) = line.strip_prefix("On branch ") {
            branch_line = Some(branch.trim().to_string());
            continue;
        }
        if line.starts_with("Your branch is up to date") {
            tracking = Some("up to date".to_string());
            continue;
        }
        if let Some(rest) = line.strip_prefix("Your branch is ahead of") {
            // "… by N commit(s)."
            if let Some(n) = rest.split("by ").nth(1).and_then(|s| s.split(' ').next()) {
                tracking = Some(format!("ahead {n}"));
            }
            continue;
        }
        if let Some(rest) = line.strip_prefix("Your branch is behind") {
            if let Some(n) = rest.split("by ").nth(1).and_then(|s| s.split(' ').next()) {
                tracking = Some(format!("behind {n}"));
            }
            continue;
        }

        let stripped = line.trim_start();
        if stripped.starts_with("Changes to be committed:") {
            section = Section::Staged;
            continue;
        }
        if stripped.starts_with("Changes not staged for commit:") {
            section = Section::Unstaged;
            continue;
        }
        if stripped.starts_with("Untracked files:") {
            section = Section::Untracked;
            continue;
        }
        // Skip git's parenthetical hints.
        if stripped.starts_with('(') || stripped.is_empty() {
            continue;
        }
        if stripped.starts_with("nothing to commit") {
            continue;
        }

        match section {
            Section::Staged => {
                if let Some(entry) = parse_change(line) {
                    staged.push(entry);
                }
            }
            Section::Unstaged => {
                if let Some(entry) = parse_change(line) {
                    unstaged.push(entry);
                }
            }
            Section::Untracked => {
                untracked.push(stripped.to_string());
            }
            Section::None => {}
        }
    }

    let mut out: Vec<String> = Vec::new();
    if let Some(branch) = branch_line {
        match tracking {
            Some(t) => out.push(format!("branch {branch} ({t})")),
            None => out.push(format!("branch {branch}")),
        }
    }
    if !staged.is_empty() {
        out.push(format!("staged: {}", staged.join(" | ")));
    }
    if !unstaged.is_empty() {
        out.push(format!("unstaged: {}", unstaged.join(" | ")));
    }
    if !untracked.is_empty() {
        out.push(format!("untracked: {}", untracked.join(" | ")));
    }

    out.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "On branch feat/TASK-002-auth\n\
Your branch is up to date with 'origin/feat/TASK-002-auth'.\n\
\n\
Changes to be committed:\n\
  (use \"git restore --staged <file>...\" to unstage)\n\
        modified:   src/lib/auth.ts\n\
        new file:   src/lib/otp.ts\n\
\n\
Untracked files:\n\
  (use \"git add <file>...\" to include in what will be committed)\n\
        src/lib/password.ts";

    #[test]
    fn summarizes_status() {
        let out = apply(SAMPLE);
        assert_eq!(
            out,
            "branch feat/TASK-002-auth (up to date)\n\
staged: M src/lib/auth.ts | A src/lib/otp.ts\n\
untracked: src/lib/password.ts"
        );
    }

    #[test]
    fn parses_rename_to_new_path() {
        let line = "        renamed:   old/a.ts -> new/b.ts";
        assert_eq!(parse_change(line).unwrap(), "R new/b.ts");
    }

    #[test]
    fn empty_input_is_empty() {
        assert_eq!(apply(""), "");
    }
}
