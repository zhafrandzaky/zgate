# ZGate — RTK Token Saver

## 1. Apa itu RTK

RTK (Token Saver) mengompresi blok **`tool_result` pada messages INPUT** sebelum
request dikirim ke provider. Output tool (git diff, grep, ls, build log, dll)
sering sangat verbose dan berulang — RTK memadatkannya tanpa membuang informasi
yang dibutuhkan model.

**Prinsip inti: output AI tidak berkurang.** RTK TIDAK PERNAH menyentuh response
dari provider — hanya input. Klaim produk: hemat 20–40% token input, kualitas
output 100% sama.

```
Client request
   │
   ▼
[RTK] scan messages → temukan tool_result blocks → autodetect jenis konten
   │            → apply filter → ganti konten dengan versi compressed
   ▼
Translator → Executor → Provider        (response lewat tanpa disentuh RTK)
```

Yang dikompres (semua format yang didukung):
- OpenAI: message `role: "tool"` content
- Claude: content block `type: "tool_result"`
- OpenAI Responses: item `type: "function_call_output"`
- Kiro: tool results dalam `conversationState`

Yang TIDAK pernah dikompres:
- Blok dengan `is_error: true`
- User/assistant text biasa
- System prompt
- Response provider (output)

Safety guarantees engine:
- **Never return empty** — jika hasil filter kosong, kembalikan original.
- **Never grow input** — jika hasil compress lebih besar, kembalikan original.

---

## 2. Filter List

### `git-diff`
Memadatkan unified diff: collapse hunk context yang tidak berubah, ringkas header.

Input:
```
diff --git a/src/lib/auth.ts b/src/lib/auth.ts
index 3f1a2b9..8c4d7e1 100644
--- a/src/lib/auth.ts
+++ b/src/lib/auth.ts
@@ -10,7 +10,7 @@ import { z } from "zod";
 const COOKIE_NAME = "zgate_session";
 const MAX_AGE = 60 * 60 * 24 * 7;
 
-export function signJwt(payload: JwtPayload) {
+export function signJwt(payload: JwtPayload, opts?: SignOpts) {
   return jwt.sign(payload, env.JWT_SECRET, { expiresIn: MAX_AGE });
 }
```
Output:
```
src/lib/auth.ts @@ -10,7 +10,7 @@
-export function signJwt(payload: JwtPayload) {
+export function signJwt(payload: JwtPayload, opts?: SignOpts) {
```

### `git-status`
Ringkas `git status` verbose ke format porcelain-style.

Input:
```
On branch feat/TASK-002-auth
Your branch is up to date with 'origin/feat/TASK-002-auth'.

Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
        modified:   src/lib/auth.ts
        new file:   src/lib/otp.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
        src/lib/password.ts
```
Output:
```
branch feat/TASK-002-auth (up to date)
staged: M src/lib/auth.ts | A src/lib/otp.ts
untracked: src/lib/password.ts
```

### `git-log`
Padatkan log multi-baris menjadi satu baris per commit.

Input:
```
commit 8c4d7e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d
Author: Ziona <z@ziron.dev>
Date:   Mon Jun 9 14:22:31 2026 +0800

    feat(auth): add OTP verification

commit 3f1a2b9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a
Author: Ziona <z@ziron.dev>
Date:   Mon Jun 9 11:02:10 2026 +0800

    feat(auth): JWT sign/verify helpers
```
Output:
```
8c4d7e1 2026-06-09 feat(auth): add OTP verification
3f1a2b9 2026-06-09 feat(auth): JWT sign/verify helpers
```

### `grep`
Dedup match berulang per file, group hasil per path.

Input:
```
src/lib/auth.ts:12:import { env } from "@/lib/env";
src/lib/auth.ts:48:  const secret = env.JWT_SECRET;
src/lib/otp.ts:3:import { env } from "@/lib/env";
src/lib/otp.ts:21:  const ttl = env.OTP_EXPIRY_MINUTES * 60;
```
Output:
```
src/lib/auth.ts: 12 import { env } …; 48 const secret = env.JWT_SECRET;
src/lib/otp.ts: 3 import { env } …; 21 const ttl = env.OTP_EXPIRY_MINUTES * 60;
```

### `find`
Collapse path list panjang menjadi tree-prefix groups.

Input:
```
./src/app/api/auth/login/route.ts
./src/app/api/auth/logout/route.ts
./src/app/api/auth/register/route.ts
./src/app/api/auth/verify-otp/route.ts
```
Output:
```
src/app/api/auth/{login,logout,register,verify-otp}/route.ts (4 files)
```

### `ls`
Buang kolom permission/owner yang berulang, ringkas ke nama + size.

Input:
```
total 48
-rw-r--r-- 1 zyy zyy  1318 Jun 12 01:48 logo.svg
-rw-r--r-- 1 zyy zyy 18890 Jun 12 23:17 UI-UX-DESIGN.md
drwxr-xr-x 2 zyy zyy  4096 Jun 13 01:52 docs
```
Output:
```
logo.svg 1.3K | UI-UX-DESIGN.md 18K | docs/
```

### `tree`
Pangkas tree dalam: batasi depth efektif, gabungkan folder satu-anak.

Input:
```
.
├── src
│   └── app
│       └── api
│           └── auth
│               ├── login
│               │   └── route.ts
│               └── register
│                   └── route.ts
```
Output:
```
src/app/api/auth/: login/route.ts, register/route.ts
```

### `dedup-log`
Hilangkan baris log berulang, ganti dengan counter.

Input:
```
[warn] Redis reconnecting...
[warn] Redis reconnecting...
[warn] Redis reconnecting...
[warn] Redis reconnecting...
[info] Redis connected
```
Output:
```
[warn] Redis reconnecting... (×4)
[info] Redis connected
```

### `smart-truncate`
Potong konten sangat panjang dengan menjaga head + tail + marker.

Input: 5000 baris output. Output:
```
<first 100 lines>
... [4800 lines truncated by RTK] ...
<last 100 lines>
```

### `read-numbered`
Padatkan file read bernomor: buang nomor baris padding + collapse blank runs.

Input:
```
     1→import { z } from "zod";
     2→
     3→export const envSchema = z.object({
     4→  JWT_SECRET: z.string().min(32),
```
Output:
```
1 import { z } from "zod";
3 export const envSchema = z.object({
4   JWT_SECRET: z.string().min(32),
```

### `search-list`
Ringkas hasil search-list (file finder) dengan grouping seperti `find` + count.

Input:
```
Found 4 files
src/components/auth/LoginForm.tsx
src/components/auth/RegisterForm.tsx
src/components/auth/OtpForm.tsx
src/components/auth/index.ts
```
Output:
```
4 files in src/components/auth/: LoginForm.tsx, RegisterForm.tsx, OtpForm.tsx, index.ts
```

### `build-output`
Buang progress noise compiler/bundler, simpan errors/warnings + summary.

Input:
```
$ next build
   Creating an optimized production build ...
 ✓ Compiled successfully
   Collecting page data ...
   Generating static pages (0/24) ...
   Generating static pages (12/24) ...
   Generating static pages (24/24)
 ✓ Finalizing page optimization
Route (app)                Size     First Load JS
┌ ○ /                      5.2 kB   92 kB
├ ○ /dashboard             8.1 kB   110 kB
warning: unused variable `tmp` in src/lib/rtk.ts:42
```
Output:
```
next build: OK (24 pages)
warning: unused variable `tmp` in src/lib/rtk.ts:42
/ 92kB, /dashboard 110kB
```

---

## 3. Auto-Detection Logic

`rtk/src/autodetect.rs` menentukan filter dari konten tool_result (bukan dari nama
tool — nama tool tidak reliable antar client):

1. **Signature scan** (urutan prioritas):
   - `diff --git ` / `@@ -` → `git-diff`
   - `On branch ` / `Changes to be committed` → `git-status`
   - `commit [0-9a-f]{40}` → `git-log`
   - pola `path:line:content` berulang → `grep`
   - mayoritas baris adalah path (`^[./][^ ]+$`) → `find` / `search-list`
   - `total \d+` + kolom permission `[-d][rwx-]{9}` → `ls`
   - box-drawing chars (`├──`, `└──`) → `tree`
   - `^\s*\d+[→:|]` di banyak baris → `read-numbered`
   - keyword build (`Compiled`, `webpack`, `error TS`, `cargo build`) → `build-output`
2. **Fallback chain**: jika tidak ada signature → `dedup-log`; jika masih lebih
   besar dari threshold (default 4 KB) → `smart-truncate`.
3. **Threshold**: konten < 256 bytes dilewati (overhead tidak sepadan).
4. Deteksi salah → aman, karena setiap filter punya guarantee never-grow +
   never-empty.

---

## 4. Caveman Mode

Mode kompresi agresif opsional (off by default, per provider connection):

- Strip semua artikel/filler yang tidak membawa makna struktural dari tool output
  (bukan dari pesan user).
- Whitespace collapse total (multi-space → satu, blank lines hilang).
- Path disingkat: `src/app/api/auth/login/route.ts` → `s/a/api/auth/login/route.ts`
  dengan legend sekali di awal.
- Angka presisi panjang dibulatkan (`1.2345678s` → `1.23s`).
- Target tambahan hemat 10–15% di atas filter normal, dengan trade-off readability
  untuk model — gunakan untuk model besar yang robust, hindari untuk model kecil.

UI: toggle "Caveman mode" di pengaturan RTK per provider connection, dengan warning
trade-off.

---

## 5. Enable/Disable per Provider Connection

- Dashboard → Settings → RTK (`components/settings/RTKSettings.tsx`):
  - Master toggle RTK (default ON)
  - Per provider connection: ON / OFF / Caveman
  - Stats: estimated tokens saved (7/30 hari)
- Runtime: chatCore membaca setting connection → panggil `src/lib/rtk.ts` hanya
  jika enabled.
- Per-request escape hatch: header `X-ZGate-RTK: off`.

---

## 6. Rust Engine Spec

### Crate structure

```
rtk/
├── Cargo.toml            # bin + lib, deps: serde, serde_json, regex, once_cell
└── src/
    ├── lib.rs            # public API
    ├── main.rs           # CLI binary: stdin → compress → stdout (+ HTTP mode opsional)
    ├── autodetect.rs     # signature scan → FilterKind
    ├── compress.rs       # orchestrator: parse messages, walk tool_results, apply
    └── filters/
        ├── mod.rs
        ├── git_diff.rs
        ├── git_status.rs
        ├── git_log.rs
        ├── grep.rs
        ├── find.rs
        ├── ls.rs
        ├── tree.rs
        ├── dedup_log.rs
        ├── smart_truncate.rs
        ├── read_numbered.rs
        ├── search_list.rs
        └── build_output.rs
```

### Public API (lib.rs)

```rust
pub enum FilterKind {
    GitDiff, GitStatus, GitLog, Grep, Find, Ls, Tree,
    DedupLog, SmartTruncate, ReadNumbered, SearchList, BuildOutput,
}

pub struct CompressOptions {
    pub caveman: bool,
    pub max_block_bytes: usize,   // smart-truncate threshold, default 4096
    pub min_block_bytes: usize,   // skip threshold, default 256
}

pub struct CompressStats {
    pub original_bytes: usize,
    pub compressed_bytes: usize,
    pub blocks_processed: u32,
    pub filters_applied: Vec<FilterKind>,
}

/// Compress satu blok teks tool_result. Guarantee: never empty, never grow.
pub fn compress_block(input: &str, opts: &CompressOptions) -> (String, FilterKind);

/// Compress full request JSON (messages array semua format yang didukung).
/// Hanya menyentuh tool_result di input; is_error blocks dilewati.
pub fn compress_request(body: &str, opts: &CompressOptions)
    -> Result<(String, CompressStats), RtkError>;

pub fn detect(input: &str) -> FilterKind;
```

### CLI binary (main.rs)

```
# stdin → stdout (dipanggil Bun.spawn dari src/lib/rtk.ts)
echo "$REQUEST_JSON" | rtk compress [--caveman] [--stats]

# stats-only (untuk dashboard estimate)
echo "$REQUEST_JSON" | rtk stats

# HTTP mode opsional (long-running, hindari spawn overhead)
rtk serve --port 7077    # POST /compress
```

Exit codes: `0` OK, `1` parse error (caller harus pass-through original), `2` bad
args. Apapun yang gagal → TypeScript wrapper pass-through request original — RTK
tidak boleh pernah memblok request.

### TypeScript wrapper (`src/lib/rtk.ts`)

- `Bun.spawn` subprocess dengan `RTK_BINARY_PATH`, stdin pipe JSON, timeout 2s.
- Timeout/crash/non-zero exit → return original body + log warning.
- Mode `serve` (HTTP) opsional via env untuk deployment high-traffic.

### Testing

Unit test per filter (Rust, `#[cfg(test)]` + fixtures): contoh input/output di
section 2 adalah kasus minimum; tambah edge cases: input kosong, input 1 baris,
unicode, ANSI escape codes, konten yang sudah pendek (must pass-through).
Property tests: `compressed.len() <= original.len()`, `!compressed.is_empty()`.
