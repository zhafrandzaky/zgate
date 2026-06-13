# ZGate — Email Templates Documentation

## Email Stack

- **Production:** Resend (`RESEND_API_KEY`) — transactional email API
- **Development:** Mailpit (Docker) — local SMTP catcher
  - SMTP: `localhost:1025`
  - Web UI: `http://localhost:8025`
- **Templates:** React Email (`@react-email/components`)
- **Sender:** `ZGate <noreply@zgate.ziron.dev>`

---

## Email Templates

### 1. OTP Verification Email

**File:** `emails/OtpEmail.tsx`

**Trigger:** Sent when user registers or requests password reset.

**Subject:** `Your ZGate verification code: {CODE}`

**From:** `ZGate <noreply@zgate.ziron.dev>`

**Variables:**
- `code` — 6-digit OTP code (e.g., "123456")
- `expiryMinutes` — expiry time (default: 10 minutes)
- `userName` — user's email address

**Content:**
- ZGate logo at header (embedded)
- Large, bold 6-digit code with wide letter-spacing
- Countdown info: "This code expires in 10 minutes"
- Warning: "Do not share this code with anyone"
- Clean design: dark-themed if email client supports, fallback to light
- Footer: ZGate branding + support link

**Design Spec:**
- Code display: `font-size: 32px`, `letter-spacing: 8px`, `font-weight: 700`, monospace font
- Background: dark (#0a0a0a) for dark mode, white (#ffffff) for light fallback
- Accent: indigo for code highlight box
- Responsive: works on mobile email clients

---

### 2. Welcome Email

**File:** `emails/WelcomeEmail.tsx`

**Trigger:** Sent after successful OTP verification (email confirmed).

**Subject:** `Welcome to ZGate!`

**From:** `ZGate <noreply@zgate.ziron.dev>`

**Variables:**
- `userName` — user's email address

**Content:**
- ZGate logo at header
- Welcome message: "Your account is verified and ready"
- Quick start guide:
  1. Connect your first AI provider
  2. Create a combo for automatic fallback
  3. Generate an API key
  4. Start using `https://zgate.ziron.dev/v1` with your favorite tools
- Code snippet example: how to configure Claude Code to use ZGate
- CTA button: "Go to Dashboard"
- Footer: branding + support

---

### 3. Ban Notification Email

**File:** `emails/BanNotificationEmail.tsx`

**Trigger:** Sent when admin bans a user.

**Subject:** `Your ZGate account has been suspended`

**From:** `ZGate <noreply@zgate.ziron.dev>`

**Variables:**
- `userName` — user's email address
- `reason` — ban reason from admin
- `bannedAt` — timestamp of ban

**Content:**
- ZGate logo at header
- Clear notification: "Your account has been suspended"
- Reason displayed prominently
- Information: "You cannot use the API or dashboard while suspended"
- Contact info: "If you believe this is a mistake, contact support"
- Professional, neutral tone

---

### 4. Unban Notification Email

**Trigger:** Sent when admin unbans a user.

**Subject:** `Your ZGate account has been restored`

**From:** `ZGate <noreply@zgate.ziron.dev>`

**Variables:**
- `userName` — user's email address

**Content:**
- "Your account has been restored"
- "You can now use the dashboard and API again"
- CTA button: "Go to Dashboard"

---

### 5. Admin Broadcast Email

**Trigger:** Sent when admin broadcasts to all users.

**Subject:** (admin-defined)

**From:** `ZGate <noreply@zgate.ziron.dev>`

**Variables:**
- `subject` — admin-defined subject
- `message` — admin-defined message body (HTML)
- `userName` — recipient's email

**Content:**
- ZGate branded header/footer
- Admin-defined message body
- Unsubscribe option (if applicable)

---

## Email Sender Library

**File:** `src/lib/mail.ts`

### Configuration

```typescript
// Auto-detect from NODE_ENV
if (process.env.NODE_ENV === 'production') {
  // Use Resend API
  transporter = Resend(RESEND_API_KEY);
} else {
  // Use Nodemailer + Mailpit (SMTP)
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
  });
}
```

### Functions

```typescript
// Send OTP email
await sendOtpEmail(to: string, code: string, expiryMinutes: number);

// Send welcome email
await sendWelcomeEmail(to: string, userName: string);

// Send ban notification
await sendBanEmail(to: string, reason: string);

// Send unban notification
await sendUnbanEmail(to: string);

// Send broadcast to multiple recipients
await sendBroadcastEmail(recipients: string[], subject: string, html: string);
```

### Template Rendering

React Email templates are rendered to HTML using `render()` from `@react-email/components`. The rendered HTML is then sent via the configured transport.

---

## Testing with Mailpit

### Setup

Mailpit runs via Docker Compose:
```bash
docker compose up -d mailpit
```

### Access
- **Web UI:** http://localhost:8025
- **SMTP:** localhost:1025 (no auth required)

### Test Flow

1. Register a new user at http://localhost:3000/register
2. OTP email arrives in Mailpit
3. Open http://localhost:8025 to view the email
4. Copy the OTP code
5. Verify in the app

### Preview Templates

```bash
# Start React Email dev server
bunx email dev

# Opens browser at http://localhost:3001 with template previews
```

### Test All Templates

| Template | How to Trigger |
|----------|----------------|
| OTP Verification | Register new user |
| Welcome | Complete OTP verification |
| Ban Notification | Admin bans user from admin panel |
| Unban Notification | Admin unbans user |
| Broadcast | Admin sends broadcast from admin panel |

---

## Email Design Guidelines

- **Inline styles only** — email clients strip `<style>` blocks
- **Table-based layout** — most compatible across email clients
- **Max width:** 600px
- **Images:** embedded or absolute URLs (no relative)
- **Logo:** embedded as base64 or hosted URL
- **Colors:** ZGate brand colors (dark theme primary, fallback light)
- **Font:** System fonts (email clients don't load custom fonts)
- **Responsive:** mobile-friendly with fluid widths
- **Accessibility:** alt text on images, sufficient contrast
