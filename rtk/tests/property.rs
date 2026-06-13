//! Property-style invariant tests over a varied corpus.
//!
//! Every block, whatever the content and whatever the mode, must honor the two
//! engine guarantees: never grow, never empty (for non-empty input). See
//! docs/RTK.md §5 testing notes.

use rtk::{compress_block, CompressOptions};

/// A spread of realistic and adversarial tool outputs.
fn corpus() -> Vec<String> {
    let mut inputs = vec![
        // Edge cases.
        String::new(),
        "single line".to_string(),
        "two\nlines".to_string(),
        // Unicode and emoji (must not panic on char boundaries).
        "日本語のテキスト 🚀 ".repeat(40),
        // ANSI escape codes.
        "\x1b[31mred\x1b[0m \x1b[1mbold\x1b[0m line\n".repeat(40),
        // Plain repeated log (dedup fallback).
        "[warn] Redis reconnecting...\n".repeat(60),
        // Whitespace-heavy.
        "    indented     spaced     content    \n".repeat(40),
    ];

    // Filter-specific samples, padded past the 256-byte threshold.
    inputs.push("diff --git a/x.ts b/x.ts\n@@ -1,3 +1,3 @@\n unchanged\n-old\n+new\n".repeat(8));
    inputs.push(
        (0..30)
            .map(|n| format!("src/app/api/route{n}/handler.ts:{n}:export const x = {n};"))
            .collect::<Vec<_>>()
            .join("\n"),
    );
    inputs.push(
        (0..40)
            .map(|n| format!("./src/components/widget/Item{n}.tsx"))
            .collect::<Vec<_>>()
            .join("\n"),
    );
    inputs.push(
        (1..=60)
            .map(|n| format!("   {n}→const value{n} = compute({n});"))
            .collect::<Vec<_>>()
            .join("\n"),
    );

    inputs
}

#[test]
fn never_grows_and_never_empties_normal_mode() {
    let opts = CompressOptions::default();
    for input in corpus() {
        let (out, _) = compress_block(&input, &opts);
        assert!(
            out.len() <= input.len(),
            "grew: {} -> {} for input starting {:?}",
            input.len(),
            out.len(),
            &input.chars().take(20).collect::<String>()
        );
        if !input.is_empty() {
            assert!(!out.is_empty(), "emptied a non-empty block");
        }
    }
}

#[test]
fn never_grows_and_never_empties_caveman_mode() {
    let opts = CompressOptions {
        caveman: true,
        ..CompressOptions::default()
    };
    for input in corpus() {
        let (out, _) = compress_block(&input, &opts);
        assert!(out.len() <= input.len(), "caveman grew a block");
        if !input.is_empty() {
            assert!(!out.is_empty(), "caveman emptied a non-empty block");
        }
    }
}

#[test]
fn caveman_never_loses_to_normal_mode() {
    let normal = CompressOptions::default();
    let cave = CompressOptions {
        caveman: true,
        ..CompressOptions::default()
    };
    for input in corpus() {
        let (n, _) = compress_block(&input, &normal);
        let (c, _) = compress_block(&input, &cave);
        // Caveman is an additional pass — it must not be larger than normal mode.
        assert!(c.len() <= n.len(), "caveman larger than normal mode");
    }
}
