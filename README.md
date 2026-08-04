# americandrm

`americandrm` is a small-batch apparel storefront built as a client-side React application. It presents the collection, loads a Supabase-backed catalog, supports email and Google sign-in, keeps a guest or account cart, and sends authenticated customers to Stripe Checkout for card payment and US shipping collection.

The checkout path is deliberately server-validated: the browser sends only variant IDs and quantities. Supabase Edge Functions retrieve current product data, validate availability and pricing, create the Stripe session, and use a signed Stripe webhook to finalize paid orders.

## Contents

- [Stack](#stack)
- [Capabilities](#capabilities)
- [Project layout](#project-layout)
- [Prerequisites](#prerequisites)
- [Run locally](#run-locally)
- [Configuration](#configuration)
- [Set up Supabase](#set-up-supabase)
- [Set up Stripe Checkout](#set-up-stripe-checkout)
- [How checkout works](#how-checkout-works)
- [Routes](#routes)
- [Data model and access](#data-model-and-access)
- [Quality checks](#quality-checks)
- [Deployment](#deployment)
- [Development notes](#development-notes)
- [Troubleshooting](#troubleshooting)

## Stack

| Area | Technology |
| --- | --- |
| UI | React 19, React DOM, CSS |
| Build and local server | Vite 8 |
| Data, auth, storage, server functions | Supabase |
| Payments | Stripe Checkout and Stripe webhooks |
| Type checking and linting | TypeScript and ESLint |

The browser app is JavaScript/JSX. Shared database types and several data services are TypeScript; the included TypeScript configuration checks both the typed code and eligible JavaScript without emitting files.

## Capabilities

- Responsive editorial storefront with home, collection, brand, lookbook, contact, and product-detail views.
- Catalog sourced from `products`, `product_images`, and `product_variants` in Supabase.
- Variant-aware product details, stock-aware cart quantities, related-product selection, and price formatting.
- Guest cart persisted in `localStorage`, which merges into the account cart after sign-in.
- Supabase Auth with email/password registration, sign-in, password recovery, persistent sessions, and Google OAuth.
- Customer profile details, profile-picture upload, and order history.
- Public media buckets for catalog/editorial assets plus a user-owned avatar bucket.
- Authenticated Stripe Checkout for cards and US shipping addresses.
- Server-side cart validation, inventory reservation, trusted checkout references, signed webhook handling, and idempotent paid-order creation.

## Project layout

```text
.
├── src/
│   ├── components/       # Reusable UI, cart, checkout, navigation, and loading states
│   ├── context/          # App, authentication, and cart providers
│   ├── hooks/            # Data and interaction hooks
│   ├── pages/            # Hash-routed storefront and account screens
│   ├── services/         # Supabase table, catalog, profile, and checkout access
│   ├── types/            # Database and catalog type definitions
│   └── utils/            # Hash routing and auth-return helpers
├── supabase/
│   ├── migrations/       # Database schema, RLS, storage, and checkout SQL
│   └── functions/        # Deno Edge Functions
├── .env.example          # Safe browser-environment template
├── package.json          # App scripts and dependencies
└── vite.config.js
```

## Prerequisites

- A current, supported Node.js release compatible with Vite 8.
- npm (included with Node.js).
- A Supabase project and the Supabase CLI to apply migrations and deploy Edge Functions.
- A Stripe account for checkout/payment functionality.

## Run locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template to a local file. PowerShell example:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. Fill in the browser variables described in [Configuration](#configuration).

4. Start the Vite dev server:

   ```bash
   npm run dev
   ```

5. Open the local address Vite prints (normally `http://localhost:5173`).

The app will render its static shell without Supabase credentials, but catalog, authentication, account, storage, persisted-cart, and checkout features require a configured backend.

## Configuration

### Browser environment variables

Create `.env.local` (or `.env`) from `.env.example`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

`VITE_` values are embedded in the client bundle. Only use Supabase's browser-safe anon/publishable key here—never place a service-role key or Stripe secret in a Vite variable.

### Edge Function secrets

Set these as Supabase Edge Function secrets, not in the frontend environment:

| Secret | Used by | Purpose |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | `create-checkout-session`, `stripe-webhook` | Calls Stripe's server API. |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` | Verifies Stripe's signed raw webhook payload. |
| `SITE_URL` | `create-checkout-session` | Absolute storefront URL for Stripe success/cancel redirects. |

Supabase automatically provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to deployed Edge Functions. The service-role key must remain server-only.

## Set up Supabase

### 1. Link the project and apply migrations

Authenticate and link the local repository to the intended Supabase project, then push the versioned migrations:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

The migrations are ordered by filename and should be applied in that order. They create the following foundations:

- customer-facing `profiles` and compatibility `users` records, kept in sync with `auth.users`;
- product, image, variant, cart, order, and order-item records;
- RLS policies for public catalog reads and customer-owned account/cart/order data;
- the `profile-avatars`, `product-images`, `lookbook`, and `brand-assets` Storage buckets;
- secure SQL functions used for checkout availability validation, inventory reservation, and paid-order finalization;
- `stripe_checkout_attempts`, which stores server-trusted checkout inputs and payment lifecycle state.

The frontend currently writes serialized account-cart items to the compatibility `public.cart` table. The normalized `carts` and `cart_items` tables are also present for a future migration.

### 2. Configure authentication

In **Supabase Dashboard → Authentication**:

1. Enable Email authentication.
2. Add `http://localhost:5173/**` to redirect URLs for local development.
3. Add your deployed site's equivalent URL pattern for production.
4. If using Google sign-in, enable and configure the Google provider, then add the provider redirect URL Supabase supplies to Google Cloud.

The app processes Supabase callback parameters in the hash and returns successful sign-ins to the intended page (or the profile page). Password recovery redirects to `#login` and then opens the profile flow to set a new password.

### 3. Add catalog content

Create active products in `public.products`, then add at least one corresponding record in both `public.product_variants` and `public.product_images`.

Important catalog fields:

| Table | Fields used by the storefront |
| --- | --- |
| `products` | `id`, `name`, `slug`, `description`, `status`, `featured`, `metadata` |
| `product_variants` | `id`, `product_id`, `name`, `price`, `currency`, `color`, `size`, `stock_quantity` |
| `product_images` | `product_id`, `url`, `alt_text`, `sort_order` |

Only products whose `status` is `active` are publicly readable. Product URLs use the database product ID (`#product/<id>`); `slug` is available for catalog management but is not the route key today. Place public catalog imagery in the `product-images` bucket (or use another publicly accessible URL) and store the final asset URL in `product_images.url`.

## Set up Stripe Checkout

### 1. Deploy the functions

```bash
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook --no-verify-jwt
```

`stripe-webhook` must not require a Supabase JWT because Stripe, rather than a signed-in customer, calls it. It authenticates each request using the `Stripe-Signature` header and `STRIPE_WEBHOOK_SECRET`. The repository's `supabase/config.toml` records this setting.

`create-order` is also included as a secured, authenticated order-creation function for integrations that need it; the current storefront checkout uses `create-checkout-session` and the webhook path instead.

### 2. Set production or test secrets

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set SITE_URL=http://localhost:5173
```

For a deployed environment, change `SITE_URL` to the exact public origin, without a trailing slash. Use matching Stripe test or live keys; do not mix modes.

### 3. Register the webhook endpoint

In Stripe, create an endpoint at:

```text
https://<your-project-ref>.supabase.co/functions/v1/stripe-webhook
```

Subscribe to exactly these events:

- `checkout.session.completed`
- `checkout.session.expired`
- `payment_intent.payment_failed`

Copy the endpoint signing secret into `STRIPE_WEBHOOK_SECRET` and redeploy or update the function secret if required by your deployment workflow.

### 4. Test locally

For local end-to-end testing, run the frontend and forward Stripe test events to the deployed endpoint (or to a locally served function) using the Stripe CLI. Ensure `SITE_URL` points to the frontend origin that should receive the post-checkout redirect. Stripe test card `4242 4242 4242 4242` can be used with any future expiry date and CVC in test mode.

## How checkout works

```text
Customer
  │ chooses a variant and quantity
  ▼
React cart ── guest localStorage or signed-in public.cart
  │ authenticated checkout request: variant IDs + quantities only
  ▼
create-checkout-session Edge Function
  │ verifies Supabase access token
  │ calls validate_checkout_items for current price/stock/currency
  │ writes trusted stripe_checkout_attempts reference
  ▼
Stripe Checkout ── collects payment and US shipping address
  │ signed event
  ▼
stripe-webhook Edge Function
  │ verifies Stripe signature and retrieves canonical Stripe objects
  ▼
finalize_paid_stripe_checkout SQL function
  │ idempotently creates order snapshots and atomically reserves inventory
  ▼
orders + order_items (status: paid)
```

This design means neither product prices nor totals from the browser or webhook payload are trusted for order creation. The current database data is re-validated before Stripe receives line items, and finalization uses the stored trusted checkout reference. The finalization function also serializes work per Stripe session so retry delivery does not create duplicate paid orders.

The payment success screen confirms the redirect and links to order history. A redirect alone is not proof that an order was finalized; the Stripe webhook is the authoritative payment confirmation.

## Routes

The app is a hash-routed single-page application, so static hosts do not need rewrite rules for routes.

| Route | View |
| --- | --- |
| `#` | Home |
| `#shop` | Collection/catalog |
| `#product/<product-id>` | Product details |
| `#story`, `#about`, `#lookbook`, `#contact` | Brand/editorial pages |
| `#cart` | Cart |
| `#checkout` | Authenticated checkout handoff |
| `#login`, `#signup` | Authentication |
| `#profile`, `#orders` | Protected customer account areas |
| `#payment-success?session_id=<stripe-session-id>` | Post-Stripe confirmation |

Unknown routes resolve to the not-found screen. Checkout, profile, and orders redirect unauthenticated visitors to login, preserving the intended destination where applicable.

## Data model and access

All application tables use Row Level Security. The core access model is:

- anyone can read active products, images, and variants;
- signed-in users can read and update only their own profile and persisted cart;
- signed-in users can read only their own orders and order items;
- client roles have no access to `stripe_checkout_attempts`;
- only Edge Functions using the service role can run the pricing, order-creation, and payment-finalization database functions.

Storage follows the same separation: catalog/editorial buckets are publicly readable but not writable by storefront clients; profile images are public for display, while upload/update/delete is scoped to the signed-in user's folder. Avatar uploads are capped at 5 MB; storefront media buckets allow up to 10 MB for their configured image types.

## Quality checks

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Create an optimized production bundle in `dist/`. |
| `npm run preview` | Serve the built bundle locally. |
| `npm run lint` | Run ESLint across the project. |
| `npm run typecheck` | Run TypeScript with `--noEmit`. |

Before merging or deploying, run:

```bash
npm run lint
npm run typecheck
npm run build
```

## Deployment

1. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your frontend host's build environment.
2. Run the quality checks and deploy the Vite build output (`dist/`) to a static host.
3. Add the production URL to Supabase Auth redirect URLs and Google OAuth configuration, if enabled.
4. Apply Supabase migrations with `supabase db push`.
5. Deploy `create-checkout-session` and `stripe-webhook`, then configure their secrets.
6. Set Stripe's webhook endpoint to the deployed Supabase function and subscribe to the three required events.
7. Add catalog data and verify a complete Stripe test-mode purchase before switching to live keys.

Because routing uses hashes, hosting the built static files at the site root is sufficient; direct requests never require server-side SPA route fallback.

## Development notes

- Keep product and image content in Supabase rather than hard-coding catalog inventory in components.
- Keep payment secrets and the Supabase service-role key out of the browser, git history, and frontend-host public variables.
- Database pricing and stock are the source of truth. Cart values are for display and are reconciled when checkout validation reports an unavailable variant, updated price, or limited stock.
- The order tables store product/variant names and unit prices as historical line-item snapshots, so later catalog edits do not rewrite past order details.
- `create-order` is separate from Stripe Checkout. Do not invoke it from a payment-success redirect when using the Stripe flow; final order creation is webhook-driven to avoid treating an unverified client redirect as a successful payment.

## Troubleshooting

| Symptom | Likely cause and resolution |
| --- | --- |
| “Supabase is not configured” | Set both browser variables in `.env.local`, then restart Vite. |
| No products appear | Apply migrations, add active products with variants and images, and confirm the anon key points to the same Supabase project. |
| Google or password-reset return goes to the wrong page | Add the exact local/production application URL patterns to Supabase Auth redirect URLs. |
| Checkout redirects to login | Sign in first; the checkout function requires a valid Supabase user token. |
| Checkout cannot start | Confirm the Edge Function is deployed and has `STRIPE_SECRET_KEY` and `SITE_URL`; ensure every cart item has a valid in-stock variant. |
| Paid checkout has no order | Check Stripe webhook deliveries, verify the endpoint subscription/events and `STRIPE_WEBHOOK_SECRET`, then inspect Supabase Edge Function logs. |
| Stripe webhook returns 401 | Deploy `stripe-webhook` with JWT verification disabled and keep signature verification enabled through the webhook secret. |

## Security

The frontend's Supabase anon/publishable key is expected to be public; its access is constrained by RLS. Treat `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` as confidential server credentials. Rotate a secret immediately if it is exposed, and never add it to `.env.example` or a committed `.env` file.
