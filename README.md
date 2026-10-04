# PokéMota — storefront + Create/Update inventory

## Requirements

Public hosting preparation and the Render Blueprint: see [DEPLOYMENT.md](DEPLOYMENT.md).
- Node.js 22 or 24 LTS (hosted template uses 24)
- PostgreSQL running locally (hosted template uses 18)

## Local setup

```bash
npm ci
cp .env.example .env
# Edit .env: set your local PostgreSQL DATABASE_URL and a unique ADMIN_PASSWORD (16+ chars).
# Create the pokemota database first (for example, createdb pokemota).
npm run db:init
npm run db:runtime
npm run dev
```

Visit **http://localhost:3000** for the storefront and **http://localhost:3000/admin.html** to sign in and manage inventory. **Do not use VS Code Live Server for CRUD**: it cannot run the backend. Do not commit `.env`.

The new PostgreSQL database starts **empty**. Create a product in the admin screen, optionally mark it Published, then refresh the storefront. Published products appear in the catalogue and homepage. Unpublished products are admin-only. Published inventory supports a persistent bag and EFT checkout. Static previews retain demonstration products and disable checkout.

The static GitHub Pages preview will still show example products because GitHub Pages cannot host the Node/PostgreSQL API. A production deployment must host the backend separately or migrate to a compatible hosting arrangement.

## API

- `GET /api/products` and `GET /api/products/:id` — published products only
- `POST /api/admin/login` — admin sign-in; session cookie and CSRF token
- `GET /api/admin/session` — current admin session
- `POST /api/admin/logout` — end session
- `GET /api/admin/products` — all products, authenticated
- `POST /api/admin/products` — create, authenticated + CSRF
- `PUT /api/admin/products/:id` — update, authenticated + CSRF

All prices are stored as integer cents. No sample products are inserted automatically. Orders and EFT checkout are installed. The private admin supports pending payment, paid, fulfilled and cancelled orders. Online checkout supports PayFast, Paystack and Stripe when configured; see [payment setup](PAYMENT-SETUP.md). Real photo upload is not implemented. Admin sessions and production rate-limit counters persist in PostgreSQL. Production requires the restricted database role, verified DB TLS, admin authenticator MFA and an exact HTTPS origin; see OPERATIONS.md. Set `PUBLIC_ORIGIN` to the exact production origin in production.

## Test

```bash
npm test
```

## Existing pages

Homepage, catalogue, product details, collections, story, FAQ, shipping, contact, privacy and the older **public read-only** inventory mockup (`inventory-preview.html`). The new private editor is `admin.html`.

### Sealed product catalogue

In admin, click **Create product**, then use **Find a sealed product**. Choose a set or collection and search by name (or leave the name blank to browse). Selecting a result fills its name, set, image, sealed category and condition. Enter your ZAR selling price and stock, then save or publish as usual.

The authenticated `/api/admin/sealed-catalogue/sets`, `/api/admin/sealed-catalogue/products?set=3170&name=booster&page=1` and `/api/admin/sealed-catalogue/sets/:set/products/:id` endpoints use TCGCSV's Pok?mon catalogue and TCGplayer images. No new API key or database migration is required. Provider data is cached in server memory for 24 hours and concurrent requests share a fetch. Coverage is filtered by product names and card metadata; it may omit unusual sealed formats. Missing products and images can be entered manually. Selecting a sealed product loads its TCGplayer market prices through TCGCSV and converts available prices to ZAR. Fresh prices can fill the editable selling price; missing, old or undated prices require manual entry. The refresh button also supports saved sealed catalogue links.


Customer accounts: open `account.html` to register, sign in, or update a profile. Checkout requires sign-in and reads contact details from the authenticated profile. Run `npm run db:init` after updating to create customer/session tables and link orders to customers, then restart the server. Passwords use salted scrypt hashes; customer sessions persist in PostgreSQL for 30 days. Delivery addresses are entered per order. Email changes are not available. Password changes and operator-assisted single-use recovery are implemented; see OPERATIONS.md.


Pre-launch security, hosting requirements and deployment gates: see [LAUNCH-REVIEW.md](LAUNCH-REVIEW.md). Production now requires ADMIN_PASSWORD_HASH; the local credential has been converted without changing its password. Restart an existing server to load this change.


## Current blocker work

Existing setup: preserve `.env` and `.env.migrations`; do not overwrite them with `.env.example`. The runtime connection is restricted and migrations use the separate ignored owner file. The local admin password is unchanged.

See [operations](OPERATIONS.md), [Paystack sandbox checklist](PAYSTACK-SANDBOX-CHECKLIST.md), and [policy drafts awaiting review](POLICY-DRAFTS.md). Local MFA enrollment material is ready but not enabled. No hosting purchase, public deployment, commit or push has been performed.
