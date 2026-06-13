//! ZGate RTK engine library.
//!
//! Placeholder for project init — the real compression pipeline (autodetect,
//! compress, filters) lands in TASK-004. For now this exposes a no-op passthrough
//! so the binary and Docker build stage compile.

/// Passthrough transform. Returns the input unchanged.
///
/// TASK-004 replaces this with the `tool_result` compression logic described in
/// docs/RTK.md.
pub fn process(input: &str) -> String {
    input.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passthrough_returns_input() {
        assert_eq!(process("hello"), "hello");
    }
}
