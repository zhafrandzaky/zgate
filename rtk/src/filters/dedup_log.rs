//! `dedup-log` filter — collapse consecutive identical log lines into a counter.
//!
//! Also the no-signature fallback (docs/RTK.md §3). The `×` is U+00D7. See
//! docs/RTK.md §2.

pub fn apply(input: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut prev: Option<&str> = None;
    let mut count = 0usize;

    let flush = |out: &mut Vec<String>, line: &str, count: usize| {
        if count > 1 {
            out.push(format!("{line} (×{count})"));
        } else {
            out.push(line.to_string());
        }
    };

    for line in input.lines() {
        match prev {
            Some(p) if p == line => count += 1,
            Some(p) => {
                flush(&mut out, p, count);
                count = 1;
            }
            None => count = 1,
        }
        prev = Some(line);
    }
    if let Some(p) = prev {
        flush(&mut out, p, count);
    }

    out.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "[warn] Redis reconnecting...\n\
[warn] Redis reconnecting...\n\
[warn] Redis reconnecting...\n\
[warn] Redis reconnecting...\n\
[info] Redis connected";

    #[test]
    fn collapses_consecutive_runs() {
        let out = apply(SAMPLE);
        assert_eq!(
            out,
            "[warn] Redis reconnecting... (×4)\n[info] Redis connected"
        );
    }

    #[test]
    fn single_line_unchanged() {
        assert_eq!(apply("only one line"), "only one line");
    }

    #[test]
    fn empty_input_is_empty() {
        assert_eq!(apply(""), "");
    }
}
