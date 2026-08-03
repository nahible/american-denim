# americandrm

## Supabase Setup

This project now includes a configured Supabase client in [src/lib/supabase.js](./src/lib/supabase.js).

Required environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Copy [.env.example](./.env.example) to `.env.local` or `.env` and fill in your project values:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Notes:

- Keep these values in a local `.env` file and do not commit them.
- The client is initialized lazily and stays inactive if the variables are missing.

## Authentication Setup

Authentication uses Supabase Auth with persistent browser sessions. Enable Email authentication and configure the Google provider in the Supabase dashboard. Add your local and production application URLs to Supabase Auth redirect URLs (for example, `http://localhost:5173/**`) so OAuth confirmation and password-reset links can return to the dedicated `#login` and `#profile` routes.

## Profile Storage Setup

Apply the storage migration in [supabase/migrations/20260729010000_storage_buckets.sql](./supabase/migrations/20260729010000_storage_buckets.sql). It creates the public `product-images`, `lookbook`, and `brand-assets` buckets, preserves the existing `profile-avatars` name, and installs the Storage policies used by the storefront.

## Stripe webhooks

Apply the migrations, then deploy `stripe-webhook`. Configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `SITE_URL` as Supabase Edge Function secrets (never as `VITE_` variables). In Stripe, create an endpoint at:

```
https://<project-ref>.supabase.co/functions/v1/stripe-webhook
```

Subscribe it only to `checkout.session.completed`, `checkout.session.expired`, and `payment_intent.payment_failed`. The function is intentionally configured without JWT verification because Stripe authenticates the raw request using `STRIPE_WEBHOOK_SECRET`.
