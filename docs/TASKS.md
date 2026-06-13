# ZGate — Task Index

Total aktif: **26 tasks** (TASK-001 s/d TASK-025 + TASK-028).
TASK-026 dan TASK-027 dibatalkan per Addendum 9 (tidak relevan untuk hosted SaaS).

| Task | Name | Status | Dependencies |
|------|------|--------|--------------|
| TASK-001 | Project Initialization | DONE | — |
| TASK-002 | Auth System | DONE | TASK-001 |
| TASK-003 | Email Templates | DONE | TASK-001 |
| TASK-004 | RTK Engine (Rust) | DONE | TASK-001 |
| TASK-005 | Format Translator | TODO | TASK-001 |
| TASK-006 | Provider Executors | TODO | TASK-005 |
| TASK-007 | Core Chat Handler | TODO | TASK-004,005,006 |
| TASK-008 | API Routes Compatibility | TODO | TASK-007 |
| TASK-009 | API Routes Management | TODO | TASK-001,002 |
| TASK-010 | Admin API & Backend | TODO | TASK-001,002 |
| TASK-011 | OAuth Flows | TODO | TASK-006,009 |
| TASK-012 | Dashboard UI Foundation | TODO | TASK-001 |
| TASK-013 | Landing Page | TODO | TASK-012 |
| TASK-014 | Auth Pages | TODO | TASK-012,002 |
| TASK-015 | Dashboard: Providers | TODO | TASK-012,009 |
| TASK-016 | Dashboard: Other Pages | TODO | TASK-012,009 |
| TASK-017 | Admin Dashboard UI | TODO | TASK-012,010 |
| TASK-018 | CLI Tool | TODO | TASK-002,009 |
| TASK-019 | Cloud Sync | TODO | TASK-009 |
| TASK-020 | Deployment | TODO | semua termasuk TASK-022,023,024,025,028 |
| TASK-021 | Testing | TODO | semua core termasuk TASK-022,023,024,025,028 |
| TASK-022 | Memory System (pgvector) | TODO | TASK-006,007,008 |
| TASK-023 | WebSocket Real-time Push | TODO | TASK-001,002 |
| TASK-024 | Provider Health Monitor | TODO | TASK-006,023 |
| TASK-025 | Webhook System | TODO | TASK-009 |
| TASK-026 | Tunnel System (Cloudflare + Tailscale) | CANCELLED | tidak relevan untuk hosted SaaS (Addendum 9) |
| TASK-027 | MITM Proxy System | CANCELLED | tidak relevan untuk hosted SaaS (Addendum 9) |
| TASK-028 | Proxy Pools | TODO | TASK-009 |

Update status: ubah `TODO` → `DONE`, commit `docs(tasks): mark TASK-XXX as done`
