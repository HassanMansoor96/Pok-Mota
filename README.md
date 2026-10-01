# PokéMota — storefront + Create/Update inventory

## Requirements
- Node.js 20+
- PostgreSQL 15+ running locally

## Local setup

```bash
git fetch origin
git switch feature/admin-create-update
npm install
cp .env.example .env
# Edit .env: set your local PostgreSQL DATABASE_URL and a unique ADMIN_PASSWORD (16+ chars).
# Create the pokemota database first (for example, createdb pokemota).
npm run db:init
npm run dev
```

Visit **http://localhost:3000** for the storefront and **http://localhost:3000/admin.html** to sign in and manage inventory. **Do not use VS Code Live Server for CRUD**: it cannot run the backend. Do not commit `.env`.

The new PostgreSQL database starts **empty**. Create a product in the admin screen, optionally mark it Published, then refresh the storefront. Published products appear in the catalogue and homepage. Unpublished products are admin-only. The homepage retains a demo shopping bag with checkout disabled.

The static GitHub Pages preview will still show example products because GitHub Pages cannot host the Node/PostgreSQL API. A production deployment must host the backend separately or migrate to a compatible hosting arrangement.

## API

- `GET /api/products` and `GET /api/products/:id` — published products only
- `POST /api/admin/login` — admin sign-in; session cookie and CSRF token
- `GET /api/admin/session` — current admin session
- `POST /api/admin/logout` — end session
- `GET /api/admin/products` — all products, authenticated
- `POST /api/admin/products` — create, authenticated + CSRF
- `PUT /api/admin/products/:id` — update, authenticated + CSRF

All prices are stored as integer cents. No sample products are inserted automatically. This stage intentionally does not include Delete, real photo upload, orders or payments. The in-memory session store is for local development only: use a shared persistent session store, HTTPS, a reviewed CSP and proper production secrets before deploying admin publicly. Set `PUBLIC_ORIGIN` to the exact production origin in production.

## Test

```bash
npm test
```

## Existing pages

Homepage, catalogue, product details, collections, story, FAQ, shipping, contact, privacy and the older **public read-only** inventory mockup (`inventory-preview.html`). The new private editor is `admin.html`.
