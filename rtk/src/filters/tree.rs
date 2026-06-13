//! `tree` filter — flatten box-drawing trees, collapsing single-child chains.
//!
//! See docs/RTK.md §2.

struct Node {
    name: String,
    children: Vec<Node>,
}

/// Parse one tree line into `(depth, name)`, or `None` for the root / blank
/// lines. Depth is derived from the 4-column indent before the connector.
fn parse_line(line: &str) -> Option<(usize, String)> {
    let chars: Vec<char> = line.chars().collect();
    let pos = chars.iter().position(|&c| c == '├' || c == '└')?;
    // Connector is 3 box chars + a space (`├── `); the name follows.
    let name: String = chars.iter().skip(pos + 4).collect();
    let name = name.trim().to_string();
    if name.is_empty() {
        return None;
    }
    let depth = pos / 4 + 1;
    Some((depth, name))
}

/// Recursive-descent builder over the flat `(depth, name)` list.
fn build(lines: &[(usize, String)], pos: &mut usize, depth: usize) -> Vec<Node> {
    let mut nodes = Vec::new();
    while *pos < lines.len() {
        let (d, name) = &lines[*pos];
        if *d < depth {
            break;
        }
        if *d == depth {
            *pos += 1;
            let children = build(lines, pos, depth + 1);
            nodes.push(Node {
                name: name.clone(),
                children,
            });
        } else {
            // Malformed deeper jump — skip to stay total.
            *pos += 1;
        }
    }
    nodes
}

/// Merge single-child chains into a slash-joined path, bottom-up.
fn collapse(mut node: Node) -> Node {
    node.children = node.children.into_iter().map(collapse).collect();
    while node.children.len() == 1 {
        let child = node.children.remove(0);
        node.name = format!("{}/{}", node.name, child.name);
        node.children = child.children;
    }
    node
}

fn render(node: &Node, out: &mut Vec<String>) {
    if node.children.is_empty() {
        out.push(node.name.clone());
        return;
    }
    let leaves: Vec<&str> = node
        .children
        .iter()
        .filter(|c| c.children.is_empty())
        .map(|c| c.name.as_str())
        .collect();
    if !leaves.is_empty() {
        out.push(format!("{}/: {}", node.name, leaves.join(", ")));
    }
    for child in node.children.iter().filter(|c| !c.children.is_empty()) {
        let prefixed = Node {
            name: format!("{}/{}", node.name, child.name),
            children: child.children.iter().map(clone_node).collect(),
        };
        render(&prefixed, out);
    }
}

fn clone_node(node: &Node) -> Node {
    Node {
        name: node.name.clone(),
        children: node.children.iter().map(clone_node).collect(),
    }
}

pub fn apply(input: &str) -> String {
    let lines: Vec<(usize, String)> = input.lines().filter_map(parse_line).collect();
    if lines.is_empty() {
        return input.to_string();
    }
    let mut pos = 0;
    let forest = build(&lines, &mut pos, 1);
    let mut out: Vec<String> = Vec::new();
    for node in forest {
        let collapsed = collapse(node);
        render(&collapsed, &mut out);
    }
    out.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = ".\n\
├── src\n\
│   └── app\n\
│       └── api\n\
│           └── auth\n\
│               ├── login\n\
│               │   └── route.ts\n\
│               └── register\n\
│                   └── route.ts";

    #[test]
    fn flattens_and_collapses() {
        let out = apply(SAMPLE);
        assert_eq!(out, "src/app/api/auth/: login/route.ts, register/route.ts");
    }

    #[test]
    fn non_tree_passes_through() {
        let input = "plain text\nno box drawing";
        assert_eq!(apply(input), input);
    }

    #[test]
    fn empty_input_passes_through() {
        assert_eq!(apply(""), "");
    }
}
