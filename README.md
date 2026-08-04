# American Denim | americandrm

**americandrm** is an independent, editorial-style e-commerce website for a small-batch apparel brand. It pairs a warm, tactile storefront experience with a modern commerce foundation for product discovery, customer accounts, cart persistence, and secure payments.

The site is a single-page web application with hash-based navigation, allowing every storefront and account experience to live in one responsive client application.

## Technology stack

| Area | Technology |
| --- | --- |
| Frontend | React 19 and React DOM |
| Build tooling | Vite 8 |
| Styling | Custom CSS |
| Backend platform | Supabase |
| Authentication | Supabase Auth (email/password and Google OAuth) |
| Database | Supabase Postgres with Row Level Security |
| Media storage | Supabase Storage |
| Payments | Stripe Checkout and Stripe webhooks |
| Server-side logic | Supabase Edge Functions (Deno/TypeScript) |
| Code quality | ESLint and TypeScript checking |

## Website experience

The storefront is designed around an elevated, editorial shopping flow:

- Brand-led home, story, about, lookbook, and contact pages.
- A product catalog with product imagery, prices, variant selections, availability, and related products.
- Product-detail pages for choosing color/size variants and adding them to the cart.
- A guest cart that remains available in the browser, plus a synchronized cart for signed-in customers.
- Customer sign-up, sign-in, password recovery, Google login, profile editing, and profile-picture uploads.
- Protected customer profile and order-history views.
- Stripe-hosted checkout for secure card payments and US shipping-address collection.

## Project organization

```text
.
├── src/
│   ├── components/       # Shared interface elements and commerce UI
│   ├── constants/        # Brand content, navigation, database table names
│   ├── context/          # Application, authentication, and cart state
│   ├── hooks/            # Reusable data-loading and UI behavior hooks
│   ├── lib/              # Supabase client and document helpers
│   ├── pages/            # Storefront, account, cart, and checkout screens
│   ├── services/         # Catalog, profile, storage, cart, and checkout access
│   ├── types/            # Shared, catalog, and database TypeScript types
│   └── utils/            # Hash routing and authentication return handling
├── supabase/
│   ├── migrations/       # Database schema, policies, storage, and payment SQL
│   └── functions/        # Secure Stripe and order Edge Functions
├── public/               # Static web assets
└── package.json          # Project dependencies and scripts
```

## Frontend architecture

The UI is built from focused React pages and shared components.

- `pages/` contains full views such as the home page, shop, product details, cart, checkout, login, profile, and orders.
- `components/` contains reusable visual building blocks including navigation, product cards, cart items, page heroes, buttons, form elements, loading skeletons, and footer content.
- `context/` holds global state. `AuthProvider` tracks the active Supabase session, while `CartProvider` manages guest-cart storage, account-cart synchronization, quantities, totals, and cart reconciliation.
- `hooks/` separates page behavior from presentation. Examples include hash-route handling, catalog/product queries, featured-product loading, account data, and interaction helpers.
- `services/` is the data boundary between React and Supabase. It centralizes reads and writes for products, variants, images, customers, orders, storage, and checkout requests.

## Navigation

The website uses hash-based routes, keeping navigation self-contained in the client application.

| Route | Experience |
| --- | --- |
| `#` | Homepage |
| `#shop` | Product catalog |
| `#product/<product-id>` | Individual product detail |
| `#story`, `#about`, `#lookbook`, `#contact` | Brand and editorial content |
| `#cart` | Shopping cart |
| `#checkout` | Authenticated payment handoff |
| `#login`, `#signup` | Customer authentication |
| `#profile`, `#orders` | Customer account area |
| `#payment-success` | Post-payment confirmation |

## Commerce architecture

Supabase is the system of record for catalog, customer, cart, and order data.

| Data area | Purpose |
| --- | --- |
| `products` | Product identity, descriptions, publication state, and editorial metadata |
| `product_variants` | Variant names, SKU data, price, currency, color, size, and inventory |
| `product_images` | Product imagery, alt text, and display order |
| `profiles` / `users` | Customer-facing profile data associated with Supabase Auth users |
| `cart` | The current serialized cart for signed-in customers |
| `orders` / `order_items` | Customer orders and immutable line-item snapshots |
| `stripe_checkout_attempts` | Trusted checkout references and payment lifecycle state |

The catalog is publicly readable, while customer data is protected with Supabase Row Level Security. Customers can access only their own profile, cart, orders, and order items. Catalog and editorial images are served from public Storage buckets; profile photos are organized under each customer's own storage path.

## Cart and account behavior

Guests can add products to a browser-persisted cart before creating an account. When a customer signs in, guest items are merged into their account cart and stored in Supabase for continuity across sessions.

The cart is variant-aware and respects known stock levels. Checkout validation can reconcile a cart if a selected variant is no longer available, has a new price, or has less inventory than the requested quantity.

## Payments and order integrity

Payments are handled through Stripe Checkout rather than through the website directly. This keeps sensitive card entry in Stripe's hosted experience.

```text
Customer cart
  → authenticated checkout request
  → Supabase validates current products, prices, and inventory
  → Stripe Checkout collects payment
  → Stripe webhook confirms the result
  → Supabase creates the paid order and reserves inventory
```

The browser submits only the selected variant IDs and quantities. Product prices, availability, and order totals are checked server-side against the current database before a payment session is created. After payment, a signed Stripe webhook drives order finalization rather than relying on a customer-facing redirect.

This flow protects against client-side price manipulation, stale product data, duplicate webhook delivery, and overselling during concurrent purchases.

## Backend services

The `supabase/functions/` directory contains the server-side parts of commerce:

- `create-checkout-session` authenticates the customer, validates the selected items, records a trusted checkout reference, and creates a Stripe Checkout session.
- `stripe-webhook` verifies Stripe's signed events, records expired or failed payment states, and finalizes successful payments.
- `create-order` provides a secured order-creation path for server-side or future integrations.

Database functions support those flows by validating checkout items, atomically reserving inventory, creating historical order records, and making payment finalization idempotent.

## Design and content system

Brand content and navigation labels live in `src/constants/siteContent.js`, keeping recurring editorial copy separate from UI components. Product and lookbook media are managed through Supabase Storage, while product content is database-driven rather than hard-coded into the site.

The interface uses custom CSS, reusable page primitives, responsive layouts, semantic landmarks, a skip-to-content link, and loading states for data-backed catalog surfaces.

## Security model

- Supabase Auth manages customer identity and session persistence.
- Row Level Security scopes personal data to the authenticated customer who owns it.
- Supabase service-role access is limited to Edge Functions and never exposed to the browser.
- Stripe's webhook signing secret verifies that payment events originate from Stripe.
- Server-side validation treats the database—not browser cart values—as the source of truth for price, stock, and order creation.
