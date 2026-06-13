//! ZGate RTK engine CLI.
//!
//! Modes:
//! - `rtk compress [--caveman] [--stats]` — stdin JSON → compressed JSON on
//!   stdout. With `--stats`, the stats JSON is written to stderr.
//! - `rtk stats` — stdin JSON → stats JSON on stdout (no body).
//! - `rtk serve [--port N]` — long-running HTTP server, `POST /compress`.
//!
//! Exit codes: `0` OK, `1` parse error (caller must pass through the original
//! request), `2` bad args. RTK must never block a request, so on a parse error
//! `compress` still echoes the original body to stdout before exiting non-zero.

use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};

use rtk::{compress_request, CompressOptions};

const DEFAULT_PORT: u16 = 7077;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let code = match args.get(1).map(String::as_str) {
        Some("compress") => run_compress(&args[2..]),
        Some("stats") => run_stats(),
        Some("serve") => run_serve(&args[2..]),
        Some("--version") | Some("-V") => {
            println!("rtk {}", env!("CARGO_PKG_VERSION"));
            0
        }
        Some("--help") | Some("-h") => {
            print_help(&mut io::stdout());
            0
        }
        Some(other) => {
            eprintln!("rtk: unknown command '{other}'");
            print_help(&mut io::stderr());
            2
        }
        None => {
            print_help(&mut io::stderr());
            2
        }
    };
    std::process::exit(code);
}

fn print_help<W: Write>(out: &mut W) {
    let _ = writeln!(
        out,
        "rtk — ZGate token saver\n\n\
USAGE:\n\
    rtk compress [--caveman] [--stats]   stdin JSON -> compressed JSON (stdout)\n\
    rtk stats                            stdin JSON -> stats JSON (stdout)\n\
    rtk serve [--port N]                 HTTP server, POST /compress (default {DEFAULT_PORT})\n\
    rtk --version | --help\n\n\
EXIT CODES: 0 ok, 1 parse error, 2 bad args"
    );
}

fn read_stdin() -> io::Result<String> {
    let mut buf = String::new();
    io::stdin().read_to_string(&mut buf)?;
    Ok(buf)
}

fn run_compress(flags: &[String]) -> i32 {
    let mut opts = CompressOptions::default();
    let mut want_stats = false;
    for flag in flags {
        match flag.as_str() {
            "--caveman" => opts.caveman = true,
            "--stats" => want_stats = true,
            other => {
                eprintln!("rtk compress: unknown flag '{other}'");
                return 2;
            }
        }
    }

    let body = match read_stdin() {
        Ok(b) => b,
        Err(e) => {
            eprintln!("rtk: failed to read stdin: {e}");
            return 1;
        }
    };

    match compress_request(&body, &opts) {
        Ok((out, stats)) => {
            let mut stdout = io::stdout().lock();
            let _ = stdout.write_all(out.as_bytes());
            if want_stats {
                if let Ok(json) = serde_json::to_string(&stats) {
                    eprintln!("{json}");
                }
            }
            0
        }
        Err(e) => {
            // Pass-through: emit the original body so a direct caller is unharmed.
            eprintln!("rtk: {e}");
            let mut stdout = io::stdout().lock();
            let _ = stdout.write_all(body.as_bytes());
            1
        }
    }
}

fn run_stats() -> i32 {
    let body = match read_stdin() {
        Ok(b) => b,
        Err(e) => {
            eprintln!("rtk: failed to read stdin: {e}");
            return 1;
        }
    };
    match compress_request(&body, &CompressOptions::default()) {
        Ok((_, stats)) => {
            if let Ok(json) = serde_json::to_string(&stats) {
                println!("{json}");
            }
            0
        }
        Err(e) => {
            eprintln!("rtk: {e}");
            1
        }
    }
}

fn run_serve(flags: &[String]) -> i32 {
    let mut port = DEFAULT_PORT;
    let mut i = 0;
    while i < flags.len() {
        match flags[i].as_str() {
            "--port" => {
                i += 1;
                match flags.get(i).and_then(|p| p.parse::<u16>().ok()) {
                    Some(p) => port = p,
                    None => {
                        eprintln!("rtk serve: --port needs a number");
                        return 2;
                    }
                }
            }
            other => {
                eprintln!("rtk serve: unknown flag '{other}'");
                return 2;
            }
        }
        i += 1;
    }

    let listener = match TcpListener::bind(("127.0.0.1", port)) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("rtk serve: bind 127.0.0.1:{port} failed: {e}");
            return 1;
        }
    };
    eprintln!("rtk serve: listening on 127.0.0.1:{port}");

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                std::thread::spawn(move || {
                    if let Err(e) = handle_conn(stream) {
                        eprintln!("rtk serve: connection error: {e}");
                    }
                });
            }
            Err(e) => eprintln!("rtk serve: accept failed: {e}"),
        }
    }
    0
}

fn handle_conn(stream: TcpStream) -> io::Result<()> {
    let mut reader = BufReader::new(stream.try_clone()?);

    let mut request_line = String::new();
    if reader.read_line(&mut request_line)? == 0 {
        return Ok(());
    }
    let parts: Vec<&str> = request_line.split_whitespace().collect();
    let method = parts.first().copied().unwrap_or("");
    let path = parts.get(1).copied().unwrap_or("");

    let mut content_length = 0usize;
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header)? == 0 {
            break;
        }
        let h = header.trim_end();
        if h.is_empty() {
            break;
        }
        if let Some(v) = h.to_ascii_lowercase().strip_prefix("content-length:") {
            content_length = v.trim().parse().unwrap_or(0);
        }
    }

    let mut body = vec![0u8; content_length];
    reader.read_exact(&mut body)?;
    let body_str = String::from_utf8_lossy(&body).into_owned();

    let mut stream = stream;
    if method == "POST" && path.starts_with("/compress") {
        let caveman = path.contains("caveman=1") || path.contains("caveman=true");
        let opts = CompressOptions {
            caveman,
            ..CompressOptions::default()
        };
        // Any failure passes the original body through — never block a request.
        let out = match compress_request(&body_str, &opts) {
            Ok((compressed, _)) => compressed,
            Err(_) => body_str,
        };
        write_response(&mut stream, "200 OK", "application/json", &out)
    } else if method == "GET" && path.starts_with("/health") {
        write_response(&mut stream, "200 OK", "text/plain", "ok")
    } else {
        write_response(&mut stream, "404 Not Found", "text/plain", "not found")
    }
}

fn write_response(
    stream: &mut TcpStream,
    status: &str,
    content_type: &str,
    body: &str,
) -> io::Result<()> {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(response.as_bytes())?;
    stream.flush()
}
