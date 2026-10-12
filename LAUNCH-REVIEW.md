# Launch checklist — updated 3 October 2026

Local blocker work is complete where it can be verified without public deployment or owner policy/enrollment decisions. No purchase, domain registration, public deployment, commit/push, customer message or real payment was performed. This is not a claim that the site is completely secure.

## Payment implementation and selected direction

Manual EFT plus PayFast, Paystack and Stripe hosted integrations exist. The current local environment enables **EFT and Paystack**, uses a confirmed **test-key prefix**, and is explicitly in **sandbox mode**. The owner selected EFT and Paystack for launch preparation. No provider transaction was created in this work.

Browser redirects only reload saved order status. Paystack raw-body signatures, amount/reference/ZAR/environment/transaction matching, locked paid transitions and duplicate detection are implemented. Admin reconciliation now verifies the persisted order with Paystack's server and shares the same idempotent confirmation as webhooks. A failed/abandoned/reversed result does not restock online orders. Full public callback/provider-account verification is still pending; follow [PAYSTACK-SANDBOX-CHECKLIST.md](PAYSTACK-SANDBOX-CHECKLIST.md).

## 1. Fixed and verification performed

- Local app now uses a non-owner, non-superuser PostgreSQL runtime role with explicit DML grants. Verified reads and denied CREATE TABLE. Owner credentials are separated into ignored `.env.migrations`. Startup rejects elevated privileges/owner membership; production requires certificate-verified TLS. SSL URI flags cannot silently disable verification.
- Admin passwords use salted scrypt hashes. Existing local password was preserved. Admin sessions now persist as token hashes in PostgreSQL, expire after eight hours, and become invalid after credential/MFA changes. Production rate limits use atomic PostgreSQL counters; development limits remain in memory.
- Added authenticator MFA, required in production, with database replay prevention. Private local enrollment material is prepared, but local MFA is not enabled until the owner enrolls. Added protected local admin-recovery tooling.
- Added customer password change with current-password verification and revocation of all sessions/recovery links. Operator-assisted recovery uses hashed, single-use 30-minute tokens and established-channel identity checks. It sends no messages automatically. Automatic registration email verification/delivery remains unimplemented.
- Added Paystack server reconciliation, strict sandbox/live mode matching and explicit live-readiness gate. Online stock is never automatically returned. EFT-only expiry is implemented and tested but disabled until the owner approves a payment deadline.
- Added guarded data-retention tooling: dry run by default, explicit approved periods and `--apply` required, active orders excluded, financial/order line records preserved. No real customer erasure was run. Refund/retention wording is a local draft in [POLICY-DRAFTS.md](POLICY-DRAFTS.md).
- Added encrypted PostgreSQL backups, a local restore drill, expired-record maintenance, readiness/overdue-order monitoring, aggregate authenticated operations status, graceful shutdown and loopback-only development binding.
- Earlier fixes retained: CSP/security headers, exact-Origin CSRF checks plus admin tokens, secure production cookies, generic/redacted errors, admin no-store responses, static file allowlist, server totals, row-lock/idempotency protections and stale-admin stock-update rejection. Anonymous configuration omits EFT bank details.
- Support contact is configured as hassan.mansoor96@gmail.com. No final domain or store name was introduced; payment descriptions use STORE_NAME and hosting resource names are generic.

Verified evidence:

- **59 unit/HTTP tests passed.** Includes actual Express authorization/CSRF/cookie/file/header/rate-limit checks, mocked provider signatures and reconciliation/mismatch cases, RFC 6238 vectors, privilege/TLS safeguards and encrypted-backup tamper/wrong-key rejection.
- **Isolated PostgreSQL tests passed** for duplicate retries, competing buyers for the last unit, server totals, exactly-once restock, permitted transitions, stale admin edits, persistent sessions and expiry, shared counter concurrency, MFA replay, recovery expiry/reuse, current-password verification, session revocation and guarded contact/account erasure. Temporary schema removed; existing inventory/orders were not modified by these tests.
- **Actual encrypted backup restored successfully to a temporary empty local DB.** All eight app-table fingerprints and order totals matched; final drill took about 2.3 seconds. Temporary database/plaintext archive removed. Encrypted backup and result report are retained under ignored `.local`; production recovery is not certified by this local timing.
- **Browser smoke checks** confirmed the anonymous account recovery/support information and admin authenticator field; no warning/error entries were returned for the admin-page check. Earlier home/checkout checks passed. No real credentials were entered or payments submitted in the browser.
- **Five reachable Git history commits scanned** for environment files and recognized gateway/private-key patterns: no matching files. This pattern scan is not exhaustive and does not cover unreachable history/all possible secret formats.
- Previous dependency audit reported zero known vulnerabilities. No dependency packages were added in this follow-up. Node runtime recommendation now targets supported LTS 24 rather than Node 20; local Node 22 is supported by package engines. The local installed patch version and hosted Node 24 still need release-stage runtime validation/update as appropriate.

## 2. Remaining launch gates, ranked

| Priority | What remains | Why it remains |
| --- | --- | --- |
| High | Public HTTPS staging and full Paystack sandbox success/decline/abandonment/replay/return tests, merchant/currency readiness | Public deployment is explicitly on hold; mocked/local tests cannot certify provider callback delivery. |
| High | Hosted runtime-role grants, verified DB TLS/IP allowlist, HTTPS/proxy behavior, off-site backup scheduling and hosted restore/alert delivery | No hosting resource has been created. Local grants/restore work and an offline template are ready, not deployed. |
| High before public admin | Enroll the prepared authenticator, keep an offline recovery copy and enable MFA | Owner phone/enrollment step is required; local login remains unchanged. Production rejects missing MFA. |
| Medium | Review refund/retention/EFT-deadline drafts and activate the chosen operational schedule | Owner supplied support email but no policy periods/terms. Actual expiry/erasure remains disabled, and production checkout stays closed until policy/open flags are explicit. |
| Medium | Refund/dispute/online-cancellation operational ownership; optional transactional email/registration verification | Procedures are drafted and recovery is available manually; the app does not execute refunds or send/verify registration emails automatically. |

## 3. Hosting requirements and prepared setup

The selected budget is **approximately US$13/month compute**: paid Render web 512 MB ($7) plus paid PostgreSQL 256 MB ($6), zero-cost Hobby workspace. Tax, conversion, growth, bandwidth, payment fees and independent backup storage/scheduling are extra. [Current Render pricing](https://render.com/pricing).

Offline template: [deploy/render.yaml.example](deploy/render.yaml.example). It uses Node 24 LTS, one instance, auto-deploy off, readiness checks, no domain and checkout closed. Root is the current Pok-Mota repository. Frankfurt is provisional until region confirmation. [Render template specification](https://render.com/docs/blueprint-spec), [Node LTS releases](https://nodejs.org/en/about/previous-releases).

No application disk/upload storage is needed today. PostgreSQL persists inventory/orders/accounts/admin sessions/production rate limits; product images remain external HTTPS assets. Backup jobs need authorized off-site storage because `.local` on an ephemeral host is not durable.

Keep certificate verification enabled. Render internal DB connections use self-signed certificates and do not support verify-ca/verify-full; prepare the external TLS endpoint with only service outbound CIDRs and narrowly scoped operator access allowed. Validate this on staging before opening checkout. [Connection/TLS documentation](https://render.com/docs/postgresql-creating-connecting).

Website HTTPS is managed. Paid Hobby DB offers three-day PITR, with logical exports retained seven days; independent daily encrypted exports/30-day proposed retention and a separate key copy remain required for the chosen 24-hour backup recovery-point/four-hour restore targets. [HTTPS](https://render.com/docs/tls), [PITR/backups](https://render.com/docs/postgresql-backups).

Deployment and rollback steps, scripts and recovery procedures are in [OPERATIONS.md](OPERATIONS.md). Migrate with a separate owner, apply reviewed runtime grants, test the actual hosted runtime/TLS/proxy/provider behavior and retain a known-good release artifact. Code rollback preserves database orders; database recovery uses a new instance plus bank/provider reconciliation before reopening checkout.

## 4. Owner actions/decisions needed

1. Privately enroll from `.local/admin-mfa-enrollment.txt`, preserve a secure recovery copy, enable ADMIN_TOTP_ENABLED and restart. Do not paste secrets/codes into chat.
2. Review POLICY-DRAFTS.md: proposed 48-hour EFT deadline, 365-day terminal-order contact retention, 730-day inactive-account retention, refund/return details and backup retention. These are draft operational periods, not legal-compliance conclusions, and have not been activated.
3. Confirm hosting region, who handles payment reconciliation/alerts, and the approved off-site backup destination. Keep a separate recovery copy of BACKUP_ENCRYPTION_KEY; never commit it.
4. Staging deployment authorization is still needed later. Until then, public callback/hosting verification cannot be completed. Store name/domain remain a separate decision.
