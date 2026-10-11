# OneCart

One search across Amazon, AliExpress, Temu and eBay, sorted by the **total landed price to
Israel**. Every price includes item, shipping, estimated import VAT, customs and fees, in ₪.
Clicking through goes to the store via a signed affiliate redirect.

Hebrew queries are translated before they reach the stores. Shoppers can save products and set
price-drop alerts without creating an account.

## Stack

- **App:** Next.js 16 (App Router, Cache Components), React 19, TypeScript (strict), Tailwind CSS 4,
  shadcn/ui.
- **Search:** store adapters behind one `ProductSearchProvider` interface:
  - AliExpress Affiliate API;
  - Amazon via SerpApi;
  - eBay Browse API.
- **Infrastructure:**
  - Upstash Redis for search cache and circuit breakers;
  - Supabase Postgres + anonymous auth for wishlists and alerts;
  - Frankfurter (ECB) exchange rates;
  - DeepL translation.
- **Tests:** Jest + React Testing Library, Playwright, and SQL tests for migrations and row-level
  security.

Architecture, conventions and the rules for adding a store are in [CLAUDE.md](CLAUDE.md).

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in what you have; every key is optional locally
ONECART_DEMO_PROVIDERS=true npm run dev
```

Demo mode serves a built-in sample catalog, so you don't need any API keys. Without it, only the
stores whose keys are set are searched.

## Scripts

| Command                       | What it does                                                       |
| ----------------------------- | ------------------------------------------------------------------ |
| `npm run dev`                 | Dev server (Turbopack)                                             |
| `npm run build` / `npm start` | Production build / server                                          |
| `npm run check`               | Type-check, lint, unit/component tests with coverage gate          |
| `npm run test:e2e`            | Playwright against a production build in demo mode                 |
| `npm run test:db`             | Supabase migrations and RLS policies on a throwaway local Postgres |

## Deployment

The app deploys to Vercel. See `.env.example` for every setting. In production:

- `OUTBOUND_LINK_SECRET` is required.
- `ONECART_DEMO_PROVIDERS` must **not** be set.
- The price-alert job is scheduled in `vercel.json` and needs `CRON_SECRET`.
