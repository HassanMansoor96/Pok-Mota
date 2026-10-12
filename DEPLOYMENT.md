# Public preview deployment

## Architecture and readiness

Plain HTML/CSS/browser JavaScript is served by Express 4 alongside same-origin API
routes. No frontend framework, bundler or compilation is used. Node 22/24 is required;
the Blueprint uses 24. PostgreSQL stores products, orders, accounts, sessions, recovery
tokens, MFA replay protection and shared production rate limits. No Redis or web disk
is needed. Catalogue/price lookups use TCGdex, TCGCSV/TCGplayer and Frankfurter without
catalogue API keys. The existing storefront and functionality are preserved.

Build/install: `npm ci --omit=dev`. Start: `npm start`. Tests: `npm test`.
Local: `npm run dev`, loopback port 3000 or PORT. Production binds 0.0.0.0 using
Render's PORT. PostgreSQL normally uses 5432. Migrations: `npm run db:init` with a
separate owner connection. Existing production checks enforce MFA, restricted DB
privileges, verified DB TLS, exact HTTPS origin, secure cookies and CSRF.
Hosted credentials, migrations and actual hosted smoke checks are still required.
Checkout remains closed under the existing policy gates for the public preview.

## Hosting recommendation

Root `render.yaml` creates one paid 512 MB Node service and a paid 256 MB Postgres 18
database in Frankfurt. Review Render's current billing estimate before creation;
previous operations notes budget approximately US$13/month plus storage/usage.
A short preview can use `plan: free` for the web service, with sleep/cold starts;
retain durable paid Postgres for inventory. GitHub Pages cannot run this application.

The Blueprint automates resource creation, runtime, health checks and preview gates.
Database bootstrap stays separate: `fromDatabase.connectionString` injects an owner
and an internal URL, incompatible with the app's existing non-owner and verified TLS
requirements. Use an external TLS runtime URL instead. No owner secret enters build,
start or the web environment. Automatic deploys are off so releases can be checked.

## First temporary URL

1. Create/sign into Render, connect `HassanMansoor96/Pok-Mota`, choose New > Blueprint,
   and select `feature/admin-create-update` (or the branch containing render.yaml).
   Repository root contains the Blueprint; no root directory is needed.
2. Fill prompted admin username/hash/TOTP secret privately from existing local `.env`
   and supply the support email. Enroll from `.local/admin-mfa-enrollment.txt` before
   hosted admin testing. Never paste credentials into GitHub/chat/docs.
3. Use `postgres://pending:pending@localhost/pending` as the temporary DATABASE_URL
   during resource creation. Initial web startup fails safely until step 6. This
   bootstrap placeholder is not a working public deployment. Never use the owner URL.
4. When Postgres is ready, allow your operator's public IP `/32` and the web service's
   outbound CIDRs in database External Access settings. The Blueprint initially denies
   all external access. Copy `.env.deploy.example` to ignored `.env.deploy` and put
   the external owner URL in MIGRATION_DATABASE_URL. DATABASE_SSL must remain true.
5. Locally run `npm run db:deploy`. It applies additive migrations, creates a restricted
   runtime role and verifies privileges/read access. The secret runtime URL goes into
   ignored `.local/render-runtime.env`. Retain/protect this file. If a provider CA is
   needed, set DATABASE_CA_CERT; never disable verification. If role creation succeeded
   but later verification failed, inspect the hosted role before retrying.
6. Set Render's web DATABASE_URL to that runtime URL, without surrounding quotes.
   Supply DATABASE_CA_CERT if needed. Manually deploy latest commit. Remove operator
   external IP access after setup if no longer needed.
7. Open the actual HTTPS onrender.com URL Render assigns. The app derives its origin
   from trusted RENDER_EXTERNAL_URL if PUBLIC_ORIGIN is unset; no guessed hostname is needed.
8. Verify `/api/health` returns 200 and `{ "ok": true }`, `/api/products`, storefront,
   catalogue, account registration/login and admin password plus authenticator login.
   Check `/.env`, `/server/index.js`, `/.git/config` return 404, HTTP redirects to HTTPS,
   and proxy rate limits behave correctly. Do not submit real payments.

New hosted databases are empty. Publish inventory through admin. Existing local stock
is not copied automatically: transferring it requires a reviewed export/import or
backup/restore, retaining the local DB and avoiding test orders/customer data. No sample
seed overwrites existing data. Later migrations use MIGRATION_DATABASE_URL with
`npm run db:init` in a protected operator environment; review grants for new tables.
`db:deploy` is first-time setup and refuses to overwrite its saved credential file.

## Environment reference

| Variables | Purpose |
| --- | --- |
| DATABASE_URL | Required restricted PostgreSQL runtime connection |
| NODE_ENV, PORT | production on Render; injected port; local development/3000 |
| PUBLIC_ORIGIN | Exact production HTTPS origin; automatic Render fallback |
| RENDER, RENDER_EXTERNAL_URL | Render-provided service identity/origin |
| DATABASE_SSL, DATABASE_CA_CERT | Verified TLS required in production; optional CA PEM |
| TRUST_PROXY | 1 on Render; 0 locally; verify hosted topology |
| ADMIN_USERNAME, ADMIN_PASSWORD_HASH | Required username and salted scrypt password hash |
| ADMIN_PASSWORD | Development-only fallback, at least 16 characters |
| ADMIN_TOTP_ENABLED, ADMIN_TOTP_SECRET | Production requires true and enrolled Base32 secret |
| SUPPORT_EMAIL, STORE_NAME | Contact/recovery and gateway descriptions |
| CHECKOUT_ENABLED, POLICIES_APPROVED | Both true to accept production orders; preview false |
| PAYMENT_MODE, PAYSTACK_LIVE_READY | sandbox initially; live Paystack requires sign-off |
| PAYSTACK_SECRET_KEY | Optional matching sandbox/live Paystack key |
| PAYFAST_MERCHANT_ID, PAYFAST_MERCHANT_KEY, PAYFAST_PASSPHRASE, PAYFAST_SANDBOX | Optional PayFast configuration |
| STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET | Optional Stripe configuration |
| EFT_ORDER_EXPIRY_HOURS | 0 until expiry policy approval |
| BACKUP_ENCRYPTION_KEY, PG_BIN, PGSSLROOTCERT | Operator backup/restore tooling and libpq TLS |
| RETENTION_ORDER_DAYS, RETENTION_ACCOUNT_DAYS | Optional approved retention periods |
| MIGRATION_DATABASE_URL | Operator-only owner connection |
| DATABASE_RUNTIME_ROLE | Local provisioning bookkeeping; not needed on Render |

Gateway credentials are optional for the initial preview. `.env.example` documents
local/optional values; `.env.deploy.example` has no secret. Existing `.env`,
`.env.migrations`, `.env.deploy`, `.local`, backups and keys are ignored. Preserve local
credentials and local MFA settings. Never mount an owner credential in the web service.

## Later domain

After activation, add `pokemota.hassanmansoor.co.za` in Render Custom Domains. Set the
`pokemota` CNAME to Render's supplied target at your DNS provider. Wait for domain
verification and TLS, set PUBLIC_ORIGIN=https://pokemota.hassanmansoor.co.za and redeploy.
Use that origin for login/accounts/callbacks and update gateways before payments open.
Mutating requests from the temporary origin will then fail the exact-origin CSRF check.

References: [Blueprint](https://render.com/docs/blueprint-spec),
[Postgres](https://render.com/docs/postgresql-creating-connecting),
[environment](https://render.com/docs/environment-variables),
[pricing](https://render.com/pricing), [domains](https://render.com/docs/custom-domains).
