# PokéMota — The Collector's Vault

Premium South African Pokémon TCG store (work in progress).

## Run the storefront prototype

No build step or dependencies. Open `index.html` in a browser, or serve this directory locally for a consistent development environment:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`. You can use VS Code Live Server as well.

## Current functionality

- Responsive black, gold and emerald landing page
- Filter product listings by singles or sealed items
- Search example inventory and sort by price or name
- Demo shopping bag with per-item stock limits, quantity controls, subtotal in ZAR and browser-local persistence
- Accessible shopping bag overlay, mobile layouts, FAQ and pre-launch notices

## Important

**All products, stock levels and prices are fictional examples for design/testing only.** The decorative product art is placeholder artwork, not authentic card photography. No checkout or payment collection exists yet. Do not advertise or launch these demo listings as real inventory.

## Project layout

- `index.html` — storefront markup
- `styles.css` — brand design system and responsive styling
- `products.js` — sample inventory; will eventually be replaced by API data
- `app.js` — filters, sorting, bag state and user interactions

## Next phases

1. Agree on storefront design and replace demo data with actual inventory/product photos.
2. Build secure Node.js/Express API and PostgreSQL persistence, plus a protected inventory dashboard/CSV importer.
3. Integrate and thoroughly test payment, shipping, notifications and deployment before accepting orders.
