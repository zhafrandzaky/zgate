# ZGate — Admin Dashboard Documentation

## Admin Account Setup

- Admin account is created via seed script / environment variables (NOT through public registration)
- Seed uses `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`
- Admin user has `role: ADMIN` in the database

```bash
# Seed admin user
bunx prisma db seed
```

---

## Admin URL & Authentication

- **URL:** `https://zgate.ziron.dev/zyy/admin/`
- **Login:** Separate admin login page at `/zyy/admin/` (NOT the regular `/login`)
- **JWT Secret:** `JWT_ADMIN_SECRET` — completely separate from user `JWT_SECRET`
- **Session:** Admin JWT stored in separate HttpOnly cookie

### Security
- Admin routes are protected by middleware checking admin JWT
- Admin JWT cannot access user routes and vice versa
- All admin actions are recorded in the audit log

---

## Admin Features

### 1. Users Management

**Page:** `/zyy/admin/users`

#### List Users
- Paginated table of all users
- Columns: email, role, status (active/banned), connections count, usage, joined date
- Search by email
- Sort by any column
- Filter: all / active / banned / unverified

#### User Detail (`/zyy/admin/users/[id]`)
- Full user profile
- All provider connections (read-only view)
- API keys list
- Combos list
- Usage breakdown (tokens, cost, by provider)
- Request logs (last 100)
- Action buttons: Ban, Unban, Delete, Impersonate

#### Ban User
- Requires reason (text field)
- Sends ban notification email to user
- User cannot login or use API while banned
- All active sessions invalidated
- Logged to audit log

#### Unban User
- Removes ban flag
- Sends unban notification email
- Logged to audit log

#### Delete User
- Confirmation dialog (destructive action)
- Cascade deletes all user data (connections, keys, combos, usage, memories)
- Cannot be undone
- Logged to audit log

#### Impersonate (View as User)
- Admin can temporarily view the dashboard as a specific user
- Read-only mode — cannot modify user data
- Banner shows "Viewing as: user@email.com"
- Exit impersonation returns to admin view
- Logged to audit log

---

### 2. Usage Analytics

**Page:** `/zyy/admin/usage`

#### Global Stats
- Total requests today / this week / this month
- Total cost today / this week / this month
- Total tokens (prompt + completion)
- Active users today
- Top models by usage
- Top providers by usage

#### Per-User Usage
- Click any user to see their usage breakdown
- Cost per provider, per model
- Request count trends
- Token usage trends

#### Request Logs
- All requests across all users (paginated)
- Columns: timestamp, user, provider, model, tokens, cost, status, latency
- Filter by user, provider, model, date range
- Click for full request detail

---

### 3. Maintenance Mode

**Page:** `/zyy/admin/maintenance`

#### Toggle
- Big toggle switch with current status indicator
- Green = OFF (normal operation)
- Red = ON (maintenance active)
- Optional message field: "Scheduled maintenance until 2 PM UTC"

#### Behavior When Active
- All `/v1/*` API requests return **503 Service Unavailable**
- Response includes maintenance message
- Dashboard remains accessible (for admin communication)
- WS event `maintenance:on` pushed to all connected clients

#### Turning Off
- WS event `maintenance:off` pushed to all clients
- Normal operation resumes immediately
- Logged to audit log

---

### 4. Broadcast

**Page:** `/zyy/admin/broadcast`

#### Compose Message
- Subject field
- Rich text message body
- Channel selector: Email / In-app / Both
- Preview before send

#### Send
- Sends to ALL registered users
- Email: uses Resend (prod) or Mailpit (dev)
- In-app: pushes WS event `admin:broadcast` to all connected clients
- Confirmation dialog: "Send to X users?"
- Logged to audit log

---

### 5. Providers (Read-Only)

**Page:** `/zyy/admin/providers` (if implemented)

- View all provider connections across all users
- Read-only — cannot modify
- Shows: user, provider, status, last tested
- Useful for diagnosing widespread provider issues

---

### 6. System Health

**Page:** `/zyy/admin/dashboard` (overview section)

- Server info: hostname, OS, uptime
- Database: connection count, query stats, size
- Redis: memory usage, connected clients, key count
- App: active WebSocket connections, pending requests
- Version: current app version

---

### 7. Audit Log

**Page:** `/zyy/admin/audit-log`

#### All Admin Actions Recorded

Every admin action is automatically logged:

| Action | Description |
|--------|-------------|
| `USER_BAN` | Admin banned a user |
| `USER_UNBAN` | Admin unbanned a user |
| `USER_DELETE` | Admin deleted a user |
| `USER_IMPERSONATE` | Admin impersonated a user |
| `MAINTENANCE_ON` | Admin enabled maintenance mode |
| `MAINTENANCE_OFF` | Admin disabled maintenance mode |
| `BROADCAST_SENT` | Admin sent broadcast message |
| `SETTINGS_CHANGE` | Admin changed system settings |

#### Log Entry Fields
- **adminId** — which admin performed the action
- **action** — action type (enum above)
- **targetId** — ID of affected resource (user, etc.)
- **targetType** — type of resource (User, System, etc.)
- **metadata** — JSON with action-specific details (ban reason, broadcast subject, etc.)
- **createdAt** — timestamp

#### Viewing
- Paginated table (newest first)
- Filter by action type
- Filter by admin
- Filter by date range
- Search in metadata

---

### 8. User Audit Log (Per-User)

Users can also view their own audit log at `/dashboard/audit-log`:

| Action | Description |
|--------|-------------|
| `LOGIN` | User logged in |
| `LOGOUT` | User logged out |
| `PROVIDER_ADD` | Added provider connection |
| `PROVIDER_DELETE` | Deleted provider connection |
| `KEY_CREATE` | Created API key |
| `KEY_REVOKE` | Revoked API key |
| `COMBO_CREATE` | Created combo |
| `SETTINGS_CHANGE` | Changed settings |
| `PASSWORD_CHANGE` | Changed password |

- Stored in `UserAuditLog` table
- Paginated, last 90 days
- Includes IP address and user agent

---

## Admin API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/users` | List all users |
| GET | `/api/admin/users/[id]` | User detail |
| POST | `/api/admin/users/[id]/ban` | Ban user |
| POST | `/api/admin/users/[id]/unban` | Unban user |
| DELETE | `/api/admin/users/[id]` | Delete user |
| GET | `/api/admin/usage` | Global usage stats |
| GET | `/api/admin/usage/logs` | Global request logs |
| POST | `/api/admin/maintenance` | Toggle maintenance |
| GET | `/api/admin/stats` | Dashboard stats |
| POST | `/api/admin/broadcast` | Send broadcast |
| GET | `/api/admin/audit-log` | Admin audit log |

All admin endpoints require admin JWT authentication.

---

## Admin Dashboard Design Notes

- **Style:** Utilitarian — prioritize information density and function over aesthetics
- **Theme:** Same design tokens as user dashboard (dark theme, Geist font)
- **Ban button:** Destructive action — uses AlertDialog with confirmation
- **Maintenance toggle:** Large, prominent, with current status indicator
- **Data refresh:** Auto-refresh stats every 30 seconds via WebSocket
- **Responsive:** Works on mobile for emergency admin access
