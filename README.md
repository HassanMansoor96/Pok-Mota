# PokéMota — complete read-only website preview

This branch contains the complete **static, read-only** PokéMota concept site. All product data and artwork are fictional demonstration content. There is no production inventory, authenticated admin, real contact form, order placement, payment collection or delivery commitment.

## Run

Open the folder in VS Code and start **Live Server** on `index.html`. Or run `python3 -m http.server 8080` and visit http://localhost:8080.

## Pages

- `index.html` — brand landing page, demo featured products, client-side sample cart (checkout disabled)
- `catalogue.html` — searchable/filterable catalogue with set, rarity, category and sorting
- `product.html?id=demo-001` — individual product detail (dynamic demo URL)
- `collections.html` — singles, sealed and chase collection landing cards
- `about.html` — brand story
- `faq.html` — pre-launch FAQ
- `shipping.html` — provisional delivery information
- `contact.html` — contact information placeholder; no fake form
- `privacy.html` — prototype-only privacy notice
- `inventory-preview.html` — **public, read-only design mockup** for future admin; **not a secure admin area**

## Shared assets

`styles.css` provides the original visual system, `site.css` extends it for the complete site. `products.js` holds demonstration inventory. `app.js` handles the homepage demo cart and `site.js` handles multi-page navigation, filtering, product detail and inventory preview.

## Production work still required

Confirm real inventory and product photography; secure Node/Express API; PostgreSQL schema; authenticated admin dashboard; CSV import; stock and order lifecycle; verified shipping, returns and privacy policies; Payfast integration with server-side verification; security, accessibility and browser QA; hosting/domain and monitoring. Do **not** deploy this preview as a live store or treat the dashboard mockup as private.
