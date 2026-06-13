# Security Policy

## Supported Versions

ZGate is a continuously deployed hosted service. Security fixes are applied to the latest released version on the `main` branch. Self-hosted deployments should track the latest `main` to receive security updates.

| Version | Supported |
|---|---|
| latest (`main`) | yes |
| older commits | no |

## Reporting a Vulnerability

Please report security vulnerabilities responsibly.

- **Do not** open a public GitHub issue for security vulnerabilities.
- Email **security@zgate.ziron.dev** with a description of the issue, steps to reproduce, and any relevant logs or proof of concept.
- Encrypt sensitive details if possible.

### Response Timeline

- **Acknowledgement:** within 48 hours of your report.
- **Status update:** within 7 days, including an initial assessment and remediation plan.
- We will keep you informed as the fix progresses and coordinate disclosure timing with you.

## Security Best Practices for Self-Hosting

- Set strong, unique, random values for all secrets: `JWT_SECRET`, `JWT_ADMIN_SECRET`, `API_KEY_SECRET`, `CREDENTIALS_ENCRYPT_KEY`, `MEMORY_ENCRYPT_KEY`, `MACHINE_ID_SALT` (each at least 32 characters).
- Keep `JWT_SECRET`, `CREDENTIALS_ENCRYPT_KEY`, and `MEMORY_ENCRYPT_KEY` distinct. They serve different functions; compromising one must not unlock the others.
- Never commit a real `.env` file. Use `.env.example` as a template only.
- Run PostgreSQL and Redis on a private network; do not expose them publicly.
- Terminate TLS at the edge (Cloudflare or a reverse proxy) and enforce HTTPS, HSTS, and secure headers.
- Rotate any secret that may have been exposed immediately.
- Keep dependencies up to date and review the changelog before upgrading.
- Restrict admin access; the admin login lives on a separate route and uses a separate JWT secret.

## Disclosure Policy

We follow coordinated disclosure. We ask that you give us a reasonable amount of time to investigate and patch before any public disclosure. We will credit reporters who wish to be acknowledged once a fix is released.

## Out of Scope

The following are generally not considered valid vulnerabilities:

- Reports from automated scanners without a demonstrable, exploitable impact.
- Denial of service from excessive request volume against rate-limited endpoints.
- Issues that require physical access to a user's device or a fully compromised host.
- Social engineering of ZGate staff or users.
- Vulnerabilities in third-party provider APIs that ZGate merely proxies (report those to the provider).
- Missing security headers without a concrete exploit.
