# Store operations and release gates

Updated 3 October 2026. Local preparation only: no hosting purchase, public deployment, commit/push, message to a customer or real payment. Owner choices: EFT and Paystack sandbox preparation; approximately US$13/month compute; support at hassan.mansoor96@gmail.com. Final store name/domain remain separate.

## Database credentials and migrations

The local `.env` now uses a dedicated runtime role. It has explicit DML access to eight app tables, no ownership, schema/database creation or elevated role membership. Its password was generated privately. `.env.migrations` holds the previous owner connection for migrations and isolated drills. Both files are ignored; **never mount the owner file or owner connection in the hosted web service**.

- `npm run db:init`: additive migrations, in one transaction and under a migration lock. It reads the local owner file when available. In a remote operator environment, supply only the protected migration connection.
- `npm run db:runtime`: local-only, idempotent grant setup and verification. Run after a migration that adds a table. It verifies DML/read access and denied DDL before changing local runtime configuration.
- Remote grants are prepared in `deploy/runtime-grants.sql`; the hosted role/password must be provisioned through a protected operator session. Do not grant ownership or owner membership to make startup pass. Inspect inherited privileges and revoke broad PUBLIC grants where necessary.
- App startup rejects elevated roles/owner membership and requires certificate-verified DB TLS in production. The helper strips SSL URI overrides so `sslmode=no-verify` cannot defeat the configured verification.

## Admin and account recovery

Production admin requires password plus authenticator code. `npm run admin:mfa-setup` has already prepared ignored `.local/admin-mfa-enrollment.txt`. Open it privately, add the manual key/enrollment URI to your authenticator, then set `ADMIN_TOTP_ENABLED=true` and restart. Store a separate offline recovery copy; remove the enrollment file after secure storage. Do not paste the key/code into chat. Local MFA remains disabled until you complete enrollment.

Authenticator verification uses RFC 6238 SHA-1, six digits, 30-second periods and one step of clock tolerance. Accepted steps are stored atomically, so simultaneous/repeated use is rejected. Keep host time synchronized. Production admin sessions are stored with token hashes and expire in eight hours. Password/username/MFA secret changes invalidate old sessions through the credential version.

For a lost admin password, an operator with access to the secret environment can use `npm run admin:recover` with a protected JSON input containing `password`. Do not put the password in shell arguments. This updates only the local salted hash, leaves MFA unchanged and invalidates sessions on restart. Hosted password/MFA recovery requires the separately protected hosting account; enable MFA on that account and the Paystack dashboard. There is no customer-facing admin recovery endpoint.

Customers can change their password from Account after entering the current password. The action revokes all customer sessions and unused recovery links. Forgotten-password support is manual:

1. Establish control of the **registered** email/contact channel independently; an order reference or screenshots alone do not establish ownership. Do not deliver a link to a new address solely at the requester's instruction. No automatic email verification/delivery service is configured.
2. Create a protected `.local/recovery-request.json` containing `{ "email": "the-registered-address", "identityVerified": true }` only after verification.
3. Pipe its contents to `npm run account:recovery`. The command creates a hashed token in PostgreSQL and writes its link to an ignored private recovery file; it does not print the token or send an email. Only the newest link remains valid, for 30 minutes.
4. Deliver the file's link yourself through the verified channel and remove the request/link files. The fragment token is removed from the browser URL when opened; it is submitted only to the password-reset endpoint. Successful use revokes all sessions/other links. Keep operator files under appropriate Windows ACLs; Node file modes alone do not enforce Windows ACLs.

## Payment and stock operations

The local environment remains `PAYMENT_MODE=sandbox` with Paystack test keys. Gateway labels show TEST MODE. Live keys/mode require explicit `PAYSTACK_LIVE_READY=true`; do not set this until `PAYSTACK-SANDBOX-CHECKLIST.md` is signed off. Production order creation also requires `CHECKOUT_ENABLED=true` and `POLICIES_APPROVED=true`.

- EFT: confirm actual bank receipt before marking paid. A screenshot does not establish cleared funds. Pending EFT orders can be cancelled/restocked through admin.
- Paystack: **CHECK PAYSTACK PAYMENT** retrieves server-side verification using the saved reference and matches total, ZAR, environment and transaction before marking paid. It performs no charge, refund or restock. Signed webhooks use the same locked confirmation logic.
- Online pending orders remain uncancellable through normal admin status transitions. Closing a browser, a failed verify result or an expired link does not prove that the provider can no longer accept money. Resolve the provider attempt and document reconciliation before an operational stock adjustment.
- Refunds/disputes still require the Paystack dashboard/bank and an operational record; the app does not execute refunds or interpret dispute webhooks. Investigate reversed status or an unexpected second transaction before fulfilment.
- `npm run ops:maintenance` removes expired session/recovery/rate-limit/MFA replay records. With `EFT_ORDER_EXPIRY_HOURS=0`, it does not cancel any order. Once the owner approves/publishes a payment deadline, an integer 24–720 enables EFT-only expiry in batches of 100. Review bank reconciliation before running it; online orders are excluded.

## Data retention

Review `POLICY-DRAFTS.md` before approving periods or publishing policy text. No deletion/expiry policy has been enabled. `npm run ops:retention` reports aggregate candidates only and defaults to a dry run. Applying requires the approved order/account periods, `POLICIES_APPROVED=true`, and explicit `--apply`. It anonymizes terminal order contact snapshots, preserves financial/order lines and identifiers, and removes inactive accounts only when no pending/paid order exists. Removed accounts have sessions/recovery tokens cascaded away. Do not run destructive retention against live data without the approved schedule and a backup.

## Backups and recovery

`npm run backup` creates a local AES-256-GCM encrypted PostgreSQL custom archive and integrity manifest under ignored `.local/backups`. Credentials are supplied to PostgreSQL clients through process environment, not command arguments. Plaintext dump files are removed in `finally` blocks. The backup encryption key is in ignored `.env`; keep a separate recovery copy in a secure vault/offline location. Losing both the host and that key makes encrypted backups unrecoverable.

`npm run backup:drill` is local-only. It briefly takes shared table locks to compare an exact snapshot, exports using the restricted runtime connection, restores into a randomly named empty local DB, checks all eight table fingerprints and order totals, then removes the temporary DB/plaintext archive. An encrypted real-data backup remains locally; do not upload it to an unapproved destination. The final drill passed in about 2.3 seconds. This is not a production-size restore-time guarantee or a test of disaster recovery when the entire machine is lost.

In hosted production, install matching PostgreSQL client tools in the backup/operator environment; libpq uses `verify-full` and may need the provider CA via `PGSSLROOTCERT`. Schedule daily encrypted off-site exports with restricted access and proposed 30-day retention. Alert if the newest successful export is more than 24 hours old. Keep encryption keys separately from the archives. Run a restore drill on the chosen host before accepting customers and at least monthly thereafter. Target independent-backup data loss at most 24 hours and restore within four hours; validate those targets rather than assuming the local timing applies. Managed PITR supplements these exports.

For recovery: close checkout, preserve the old database, restore into a new empty instance, verify counts/fingerprints/totals and isolated account behavior, configure restricted runtime grants, then change the app connection. Reconcile bank/provider transactions since the recovery point before reopening. A code rollback never rolls back orders or payment-provider transactions.

## Hosting, TLS and monitoring

`deploy/render.yaml.example` is an offline template, with auto-deploy disabled, no final domain, one web instance and production checkout closed. Use the current repository root (Pok-Mota); only specify `rootDir: Pok-Mota` if a future repository actually contains that subdirectory. It targets Node 24 LTS; Node 22 LTS remains supported locally. [Node release status](https://nodejs.org/en/about/previous-releases).

Budget baseline: paid Render 512 MB web at US$7/month plus 256 MB Postgres at US$6/month = **US$13/month**, excluding tax, currency conversion, growth, bandwidth, independent backup storage/scheduling and payment fees. Choose the zero-cost Hobby workspace initially. Confirm the final quote before purchasing. Plans/IDs are documented in [Render pricing](https://render.com/pricing) and [compute plans](https://render.com/docs/compute-plans).

**TLS configuration needs an explicit choice before deployment.** Render's internal Postgres endpoint uses self-signed certificates and its docs do not support verify-ca/verify-full there. This app keeps certificate verification enabled. Prepare the **external TLS endpoint**, restricted to the web service's published outbound IP CIDRs and any narrowly scoped operator access, and verify its certificate chain from the running service. The template starts with no external IPs allowed, so that list must be configured before connecting. Do not use an all-IP allowlist or disable certificate checks merely to make it connect. [Render connection/TLS documentation](https://render.com/docs/postgresql-creating-connecting). Extra internet-path latency/traffic should be checked at staging.

Render provides managed website HTTPS. Paid Hobby PostgreSQL provides a three-day PITR window and logical exports retained seven days; independent retention is still needed. [HTTPS](https://render.com/docs/tls), [recovery](https://render.com/docs/postgresql-backups).

No uploaded files or application disk are required today. PostgreSQL persists accounts/orders/admin sessions/production rate limits. Backup output is local/ephemeral until copied by an authorized backup job. PostgreSQL-backed sessions/counters remove the process-memory limitation; start at one instance within the budget and load-test before scaling.

`npm run ops:monitor` checks HTTP/DB readiness and overdue pending-order counts, emits no customer records and exits nonzero on a problem. `/api/admin/operations` exposes aggregate operational status only to an authenticated admin. Configure external uptime checks and alert routing to an owner-approved destination, plus DB disk/connection, 5xx and webhook-failure alerts. No alerts were sent in this work. Schedule maintenance in the operator/cron environment; a separate paid cron can add to the US$13 baseline. A log entry or manual monitoring run is not a configured alerting service.

## Deployment and rollback, still deferred

1. Finish owner enrollment/policy choices and sandbox sign-off. Review all local changes and the lockfile; no commit/push is authorized yet.
2. After separate deployment authorization, create isolated staging resources with test keys/data. Configure MFA, exact HTTPS origin, trusted proxy count, restricted DB role, verified external DB TLS and ingress allowlist. Keep checkout closed until explicitly opened for sandbox acceptance.
3. Back up before migrations; migrate as a separate owner, then apply explicit runtime grants. Never pass migration-owner secrets to `npm start`. Run tests on the actual Node 24/host/Postgres version and the sandbox checklist. Validate HTTPS/cookies, monitoring delivery and hosted restore.
4. Retain a known-good release artifact and compatibility with additive schema migrations. Turn on live payments/order creation only after owner sign-off and any separately authorized live acceptance procedure.
5. For an application failure, close checkout and roll back to the last reviewed artifact. Keep forward-compatible DB data. For a database failure, follow the separate restore/reconciliation process above; do not restore over live data in place.
