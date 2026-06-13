//! ZGate RTK engine CLI.
//!
//! Reads stdin, applies the RTK transform, writes to stdout. Project-init stub:
//! the real engine (TASK-004) streams JSON messages and compresses tool_result
//! blocks. For now it is a transparent passthrough so the toolchain and Docker
//! build stage are wired end to end.

use std::io::{self, Read, Write};

fn main() -> io::Result<()> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;
    let output = rtk::process(&input);
    io::stdout().write_all(output.as_bytes())?;
    Ok(())
}
