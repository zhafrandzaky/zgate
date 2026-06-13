//! CLI integration tests — drive the built binary over stdin/stdout.

use std::io::Write;
use std::process::{Command, Stdio};

fn run(args: &[&str], stdin: &str) -> (String, String, i32) {
    let mut child = Command::new(env!("CARGO_BIN_EXE_rtk"))
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn rtk");
    child
        .stdin
        .take()
        .unwrap()
        .write_all(stdin.as_bytes())
        .unwrap();
    let out = child.wait_with_output().unwrap();
    (
        String::from_utf8_lossy(&out.stdout).into_owned(),
        String::from_utf8_lossy(&out.stderr).into_owned(),
        out.status.code().unwrap_or(-1),
    )
}

fn big_diff_body() -> String {
    let mut diff = String::from("diff --git a/x.ts b/x.ts\n@@ -1,20 +1,20 @@\n");
    for i in 0..20 {
        diff.push_str(&format!(" context line {i} unchanged and verbose\n"));
    }
    diff.push_str("-removed line for the fixture\n+added line for the fixture\n");
    serde_json::json!({
        "messages": [{ "role": "tool", "content": diff }]
    })
    .to_string()
}

#[test]
fn compress_shrinks_and_exits_zero() {
    let body = big_diff_body();
    let (stdout, _stderr, code) = run(&["compress"], &body);
    assert_eq!(code, 0);
    assert!(
        stdout.len() < body.len(),
        "compressed body should be smaller"
    );
    // Output is still valid JSON.
    let _: serde_json::Value = serde_json::from_str(&stdout).unwrap();
}

#[test]
fn compress_stats_flag_writes_stats_to_stderr() {
    let (_stdout, stderr, code) = run(&["compress", "--stats"], &big_diff_body());
    assert_eq!(code, 0);
    assert!(stderr.contains("blocks_processed"));
}

#[test]
fn stats_subcommand_emits_stats_json() {
    let (stdout, _stderr, code) = run(&["stats"], &big_diff_body());
    assert_eq!(code, 0);
    let stats: serde_json::Value = serde_json::from_str(&stdout).unwrap();
    assert!(stats["blocks_processed"].as_u64().unwrap() >= 1);
}

#[test]
fn parse_error_passes_through_and_exits_one() {
    let bad = "}{ not json";
    let (stdout, _stderr, code) = run(&["compress"], bad);
    assert_eq!(code, 1);
    assert_eq!(stdout, bad, "original body must be echoed on parse error");
}

#[test]
fn unknown_command_exits_two() {
    let (_stdout, _stderr, code) = run(&["bogus"], "");
    assert_eq!(code, 2);
}

#[test]
fn caveman_flag_is_accepted() {
    let (_stdout, _stderr, code) = run(&["compress", "--caveman"], &big_diff_body());
    assert_eq!(code, 0);
}
