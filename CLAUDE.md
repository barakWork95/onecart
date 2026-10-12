@AGENTS.md

# OneCart — CLAUDE.md

OneCart is an e-commerce meta-search and deal aggregator for shoppers in Israel. One search queries
Amazon, AliExpress, Temu and eBay, normalizes every result into a `UnifiedProduct`, and shows every
product's **total landed price** in ₪: item, shipping, import VAT, customs and fees. Results default
to best match; the landed price is one tap away as a sort. "Go" sends the user to the
store through an affiliate redirect.

The landed price is the product. A wrong total is a P0 bug. A missing provider is a P2 bug.

---

## Commands

| Task                            | Command                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| Dev server (Turbopack)          | `npm run dev`                                                                              |
| Production build                | `npm run build` then `npm run start`                                                       |
| Type-check                      | `npm run typecheck`                                                                        |
| Lint                            | `npm run lint` (append `-- --fix` to autofix)                                              |
| Unit and integration tests      | `npm test`                                                                                 |
| Single test file                | `npx jest src/domain/shared/money.test.ts`                                                 |
| One Jest project                | `npx jest --selectProjects node` (logic, `*.test.ts`) or `dom` (components, `*.test.tsx`)  |
| Tests matching a name           | `npx jest -t "landed price"`                                                               |
| Watch mode                      | `npm run test:watch`                                                                       |
| Coverage (enforces thresholds)  | `npm run test:coverage`                                                                    |
| E2E (prod build, demo data)     | `npm run test:e2e` (first time: `npx playwright install chromium`)                         |
| Dev server with demo stores     | `ONECART_DEMO_PROVIDERS=true npm run dev`                                                  |
| Database migrations + RLS tests | `npm run test:db` (needs local Postgres binaries: `brew install postgresql@15`; no Docker) |
| Format                          | `npm run format` / `npm run format:check`                                                  |
| **Pre-commit gate**             | `npm run check` (typecheck, then lint, then coverage)                                      |
| Add a shadcn component          | `npx shadcn@latest add <name>`                                                             |

Run `npm run check` before every commit. A change is done only when it passes.

---

## Stack (pinned majors)

- **Next.js 16** (App Router, `cacheComponents: true`, Turbopack) with **React 19** and **TypeScript 5** (strict).
- **Tailwind CSS 4**, configured in CSS. There is no `tailwind.config.*` file; tokens live in `src/app/globals.css`.
- **shadcn/ui** (style `base-nova`, built on `@base-ui/react`, with `cn` from the `cn` package) and **lucide-react**.
- **Upstash Redis** for the search cache. **Supabase** (Postgres) for users, wishlist, alerts and the curated deal feed.
- **Zod 4** validates every boundary: env, URL params, provider payloads and Server Action input.
- **Jest 30** with **React Testing Library** (jsdom) for unit tests. **Playwright** for E2E.

> Next 16 differs from older versions. Read `node_modules/next/dist/docs/` before using an API you
> are unsure of (see AGENTS.md). Caching guide: `01-app/01-getting-started/08-caching.md`.

---

## Architecture: DDD layers with a strict dependency rule

```
src/
├── domain/            Pure TypeScript. Types, value objects, pure functions, ports (interfaces).
│   ├── shared/        Money, ProviderId, Result
│   ├── product/       UnifiedProduct, LandedPrice
│   ├── search/        SearchQuery, SearchResponse, ProductSearchProvider (port)
│   └── deals/         DealFeedItem
├── application/       Use cases. Orchestrates domain plus ports. No SDKs, no Next.
│   ├── search/        searchProducts (fan-out, circuit breaker, merge, sort, paginate)
│   └── deals/         getDealFeed
├── infrastructure/    Adapters that implement domain ports with real I/O.
│   ├── providers/     <provider>/ adapter, raw schema, mapper, fixtures, tests
│   ├── cache/         Upstash Redis cache
│   ├── db/            Supabase repositories
│   ├── translation/   DeepL / Google Hebrew→English
│   └── affiliate/     Affiliate link builders per provider
├── config/env.ts      Zod-validated server env (`env()`), server-only
├── app/               Routes, layouts, Server Actions, route handlers (thin)
├── components/ui/     shadcn primitives (generated; keep edits minimal)
├── components/features/  OneCart feature components (search bar, product card, compare sheet…)
└── lib/               Framework-level helpers (cn, formatting)
e2e/                   Playwright specs
```

**Dependency rule (ESLint enforces it in `eslint.config.mjs`):**

- `domain` imports only `domain`. It never imports React, Next, an SDK, `fetch` or `process.env`.
- `application` imports `domain`. It receives adapters through function parameters or factories and
  never imports `infrastructure`.
- `infrastructure` imports `domain` and `config`.
- `app` and `components` call application use cases, wired in the composition root
  `src/app/_composition.ts`. It is the only file that chooses concrete adapters from env. UI code
  never imports `infrastructure` directly.

### Search request flow

```
SearchBar (client) → /search?q=… (Server Component)
  → parse + validate URL params (zod) → SearchQuery
  → translate Hebrew → English (cached)            infrastructure/translation
  → searchProducts(query, providers, cache)        application/search
      for each provider IN PARALLEL:
        cache hit? → use it
        circuit open? → status "circuit_open"
        else adapter.search() with timeout → Result
      merge → filter → group → sort (default: relevance = stores' own ranking, interleaved) → paginate
      (results page needs more than the loaded store pages hold? → next store page per store, cached)
  → SearchResponse (with per-provider outcomes) → UI
"Go" button → /go/[productId] route handler → affiliate URL → 302
```

---

## TypeScript conventions

- Strict mode with `noUncheckedIndexedAccess`, `noImplicitOverride` and `noImplicitReturns`.
  **No `any`** (lint error). Use `unknown` and narrow it with Zod or a type guard.
- Never cast with `as` to silence the compiler. `as const` is fine. A cast is acceptable only right
  after a Zod parse or a type guard, with a comment explaining it.
- Domain types are `interface`s with `readonly` fields. Lists are `readonly T[]`.
- Model closed sets as a literal tuple plus a derived union:
  `const X = [...] as const; type X = (typeof X)[number]`. Do not use TypeScript `enum`.
- Prefer `null` over optional fields when a value is absent. Use `?:` only for genuinely optional
  inputs such as filters.
- Import types with `import { type Foo }` / `import type`. This is enforced.
- Use named exports only. The exception is Next files that require a default export (`page`,
  `layout`, `route`…).
- File names are kebab-case: `unified-product.ts`, `aliexpress-adapter.ts`. Components are PascalCase
  exports in kebab-case files.
- Use the `@/` path alias. No `../../` imports across layers.
- Write small pure functions. Keep side effects at the edges (`infrastructure`, `app`).
- Expected failures such as provider outages or bad input return `Result<T, E>` from
  `@/domain/shared/result`. Throw only for programmer errors and invariant violations.
- Comments explain _why_. Don't narrate what the code does.

### Money and pricing rules (non-negotiable)

- Money is **always** `Money { amountMinor: integer, currency }`. Never use a float for currency.
  Build values with `money()` / `moneyFromMajor()` and combine them with `addMoney()` / `compareMoney()`.
- Every `UnifiedProduct.price` is a full `LandedPrice` in **ILS**, and `total` is the sum of its
  components. Adapters call `calculateLandedPrice()` from `domain/pricing/`. They never compute
  taxes themselves.
- Never invent data. If a store doesn't quote shipping, pass `shipping: null`; the price then
  carries `shippingKnown: false` and the UI must show "+ shipping". Likewise, use `rating: null`
  when the store has no 0–5 star rating; don't convert other metrics into stars.
- Israeli import parameters (VAT rate, VAT exemption threshold, customs threshold) live in **one
  config object**, `src/config/israel-import-policy.ts`, that the calculator receives. Never hardcode them in an adapter. Verify the current
  values against the Israel Tax Authority before launch and whenever the law changes. Every rule needs
  a unit test at, just below and just above each threshold.
- If a provider already collects taxes at checkout, set `taxesCollectedAtCheckout: true` and use its
  figures. Do not estimate on top of them.
- Store FX rates with the product (`fxRate`) so totals can be reproduced later.

### Next.js 16 conventions

- Server Components are the default. Add `"use client"` only at the leaf that needs state or effects.
- `cacheComponents` is on. Read runtime data (`cookies()`, `headers()`, `searchParams`) inside
  components wrapped in `<Suspense>`. Static or shared data uses `"use cache"` plus `cacheLife(...)`
  plus `cacheTag(...)`. The homepage deal feed is the main candidate.
- Anything that depends on live prices, the clock or the cache (search results) calls
  `await connection()` first, so it renders at request time. Without that, Cache Components fails
  with "unstable value `Date.now()` while prerendering".
- The cross-request search cache is **Upstash Redis**, not `"use cache"`, because the in-memory
  cache does not survive serverless instances.
- Server Actions live in `actions.ts` next to their route. Validate input with Zod. Return a typed
  result and never throw raw errors to the client.
- Files that touch secrets start with `import "server-only"`. Read env only through `env()` from
  `@/config/env`.
- Use `next/image` for product images, and add each provider's CDN host to `images.remotePatterns`.

### UI conventions

- Design mobile first.
  - **Phones:** a bottom tab bar (Discover, Compare, Saved, Alerts).
  - **From `md` up:** the tab bar is hidden and the same links sit in the header
    (`DesktopNav`).
  - Both read `NAV_ITEMS` from `src/components/layout/nav-items.ts`, so add sections there only.
- Product images are shown Amazon-style: a white square tile (`bg-white`, in both themes) with the
  whole product visible (`object-contain p-4`). Store photos are shot on white, so the tile blends
  in. Never crop products with `object-cover`.
- Use brand tokens from `globals.css` (`bg-primary`, `text-brand-navy`, `bg-success` for "VAT
  included" and "free delivery" chips). Do not use ad-hoc hex colors in components.
- Format prices with `formatMoney` from `src/lib/format.ts`. It uses the `en-IL` locale, so the
  symbol comes first ("₪89"); `he-IL` would render "89 ₪" in the English UI. Headline prices round
  to whole shekels; breakdowns pass `{ precise: true }`. Never concatenate `"₪" + n`.
- Inputs that may hold Hebrew use `dir="auto"`.
- **Theme.** Dark mode is a `.dark` class on `<html>`, used through the `dark:` variant.
  - `THEME_INIT_SCRIPT` (`src/components/layout/theme.ts`) is inlined in the root layout's `<head>`.
    It applies the stored choice (`localStorage["onecart-theme"]`), or else the OS setting, before
    first paint.
  - `ThemeToggle` in the header switches and stores the theme.
  - Don't reintroduce `next-themes`: it renders its script from a client component, which makes
    React 19 log an error.
- Keep layouts RTL-safe: use logical utilities (`ms-*`, `me-*`, `ps-*`, `start-*`) instead of
  `ml-*` or `left-*`, so a Hebrew UI can ship later without a rewrite.
- Every interactive element must have an accessible name, and each page has exactly one `<h1>`.

---

## Search orchestration and product matching

- `createSearchProducts()` in `src/application/search/search-products.ts` is the only entry point
  for searches. For each provider, in parallel, it runs these steps in order:
  1. Apply the query's provider filter (`skipped`).
  2. Read the cache (`fromCache: true`).
  3. Check the circuit breaker (`circuit_open`).
  4. Make the live call under a **hard deadline** (`Promise.race`), so an adapter that ignores its
     `AbortSignal` still can't hold the search.
- A caller abort (the user navigated away) is reported as `timeout` but is **not** counted against
  the store's circuit breaker.
- Grouping, filtering, sorting and pagination happen after the merge.
- **Paging ("Load more").** `?page=N` re-renders every card through page N (`includeEarlierPages`);
  `page` is left out of the results `<Suspense>` key, so the cards already on screen stay put.
  - A provider returns one **store page** (`ProviderPage { products, hasMore }`). eBay: 50 items
    by `offset`. Amazon: store page 1 is the first `SERPAPI_AMAZON_PAGES` SerpApi pages; each
    later store page is **one** more SerpApi page (one credit). `hasMore` comes from
    `serpapi_pagination.next`.
  - Results pages are served from the store pages already loaded. A deeper store page is fetched
    only when they can't fill the requested page, only from stores with `hasMore`, and never on
    results page 1 (`deeperStorePages` defaults to `none` there). The cap is
    `DEFAULT_MAX_STORE_PAGES` (5).
  - Every store page is cached on its own key (`…:p2`), so paging back and forth never re-fetches.
    `offersFor()` (Save, alerts, cron) reads cached deeper pages but never pays for new ones.
  - "Load more" and "Find on …" are `<Link prefetch={false}>`: a prefetch could spend SerpApi credits.
- **Default sort is relevance**, so results follow what the user typed, like a store's own search.
  - The orchestrator records each offer's position in its store's results.
  - `sortGroups(…, "relevance", rankOf)` ranks each group by its best position, so every store's
    #1 comes before any #2.
  - Ties go to groups found in more stores, then to the lower price.
  - Price, delivery and rating are opt-in sorts. Tapping an active chip again clears it back to
    relevance, which has no `sort` URL param.
- **Never filter store results by the query text.** The store's own search decides what's relevant,
  synonyms included. Locally we only group, filter (by the user's explicit filters) and sort.
- **A store can set its own deadline** with `ProductSearchProvider.timeoutMs`. Amazon/SerpApi
  takes about 3–4 seconds per page, so it gets 9 seconds; everything else keeps 4.
- **Amazon with `shipping_location=IL`.** Most organic results come back unpriced (`no_featured_offers`):
  Amazon has no offer that ships them to Israel, so we skip them.
  - The `featured_products` carousels usually carry the priced, deliverable items, so read both.
  - `SERPAPI_AMAZON_PAGES` (default 2, maximum 3) pages are fetched in parallel. Each page costs
    one SerpApi credit.
  - A page of only unpriced items means "no results", not an error.
  - The recorded fixtures `fixtures/recorded-*.json` hold the real response shape.
- Product matching is pure domain code (`src/domain/matching/`, `src/domain/search/product-group.ts`).
  It is tuned for precision: a missed match is acceptable, a wrong match is a bug.
  `tokenizeTitle()` reads model codes (`whch720n`), series numbers ("Flip 6"), variants per unit
  (`6qt`, `128gb`, `6pk`, `7in1`, `gen2`), known brands, condition qualifiers (renewed, used,
  bundle) and whether the title is an accessory ("Case for …", "for Sony …", replacement parts,
  guides). Two offers match only if all of these hold:
  - they come from different stores;
  - both or neither are accessories;
  - their item prices are within 2.5× of each other;
  - no conflict: different brands, model codes, variant values, series numbers or qualifiers;
  - then one of: a shared model code with ≥ 50% containment (share of the shorter title found in
    the longer; Amazon titles run 3× longer than eBay's); a shared series number or generation of
    a branded item, no model codes, ≥ 80% containment; or ≥ 0.8 Dice title similarity
    (`title_similarity`). Accessories only get the last one: their model code names the product
    they fit. A model code on one side only, plus a brand, never matches.
- `src/domain/matching/fixtures/recorded-results.json` holds real Amazon + eBay results for seven
  queries; `recorded-results.test.ts` pins exactly which groups form. The previous matcher formed
  22 cross-store groups there, ~20 of them wrong. Re-record when tuning, and check every new group
  by hand.
- Groups use complete linkage: a new offer must match **every** offer already in the group. A
  group has at most one offer per store. Add a test case to `product-matcher.test.ts` for every
  real mismatch you find.
- `ProductGroup.matchedBy === "title_similarity"` is the weakest grouping. The card labels it
  "Similar item", others "Same item". Grouped cards spell out "Available on N stores: Amazon ₪X vs
  eBay ₪Y — Best deal on …"; single-store cards offer "Find on <other store>", a focused search
  built by `matchSearchText()`.
- Application tests use the port fakes in `src/test/fakes.ts`, never infrastructure.
  `src/test/product-factory.ts` builds valid products.

## Query translation and exchange rates

- Hebrew queries (any Hebrew letter) are translated before reaching stores. The chain is:
  1. the Redis cache (30-day TTL);
  2. DeepL (`DEEPL_API_KEY`; keys ending in `:fx` use the free endpoint);
  3. the offline glossary in `src/infrastructure/translation/hebrew-glossary.ts`.

  The glossary handles phrases, common Hebrew prefixes (ל/ב/ה/ו/ש/מ/כ, up to two letters), every
  gender and number form of adjectives, brand transliterations, and filler words ("של", "עם").
  When some words are unknown it still returns a partial translation; the UI says "some words
  couldn't be translated" and the server logs the missing words.

- If every step fails, the search runs with the original text and the UI says so. Grow the glossary
  from the logged untranslated words, or set `DEEPL_API_KEY`, which is far better coverage.
- Exchange rates come from Frankfurter (ECB reference rates, no key), cached in Redis and refreshed
  every 6 hours. If the source is down, the last-known-good rates are used for up to 7 days.
- An adapter that can't get rates returns a **non-retryable** `FX_UNAVAILABLE` error, so an FX
  outage never trips a store's circuit breaker.

## Wishlists, price alerts and Supabase

- **Schema.** Migrations live in `supabase/migrations/`, the Supabase CLI convention. Every table
  has row-level security, so users touch only their own rows; the service role (the price checker)
  is the only cross-user reader.
- **Schema changes.** Every change ships with assertions in `supabase/tests/*.test.sql`, and
  `npm run test:db` must pass. It applies the migrations to a throwaway Postgres with a minimal
  `auth` shim (`supabase/tests/auth-shim.sql`).
- **Identity is Supabase anonymous sign-in**, so there's no sign-up wall:
  - `readUserLists()` (for rendering) never creates a user;
  - `writeUserLists()` (Server Actions only) creates one on the first save;
  - `src/proxy.ts` refreshes the session cookie, because Server Components can't write cookies.
  - **Enable "Anonymous sign-ins" in the Supabase dashboard.** Upgrading an anonymous user to
    email or OAuth later keeps their rows.
- **Never trust product data from the browser.** Actions accept only `{ productId, searchText }`;
  the server re-finds the offer through the cached search (`findOffer`) and snapshots it.
- **Daily checker.** `/api/cron/price-alerts` is scheduled in `vercel.json` and requires
  `Authorization: Bearer $CRON_SECRET`.
  - It runs one search per distinct query, so cost scales with queries, not users.
  - A failed search leaves its alerts untouched for the next run.
  - A triggered alert stays triggered until the user deletes or re-creates it.
- **Backends.**
  - Supabase when `NEXT_PUBLIC_SUPABASE_*` is set.
  - Otherwise, in demo mode, an in-memory store keyed by an httpOnly cookie (demo and E2E only).
  - Otherwise the Save and Alert UI is hidden.
- **Process singletons.** Services live on `globalThis` (see `getServices()`), because Next bundles
  route handlers and pages separately and module-level state would split per bundle.

## Caching rules

- The Redis key comes from `searchCacheKey()` in `domain/search/search-query.ts`. It is scoped per
  **provider**, **destination country** and **normalized English query text**.
- Sort, filters and results pagination are applied **after** the cache read. Never put them in the
  key; only the store page (what the store returned) is part of it.
- The TTL comes from `SEARCH_CACHE_TTL_SECONDS` (default 24h). Translation results use their own
  longer-lived keys.
- Bump the `v2` segment in the key whenever the cached entry or `UnifiedProduct` shape changes.
  Deeper store pages add a `:pN` suffix.
- Never cache an error or an empty result from a failed call. Do cache a legitimate "0 results".
- If Redis is unavailable, log it and continue uncached. A cache outage must not break search.
  Without Upstash env vars, the composition root uses `createInMemoryRedis()`, which is
  per-instance only.
- The homepage deal feed reads Supabase and the Redis cache only. It must **never** trigger a live
  provider API call.

## Error resilience

- Call providers in parallel and never sequentially. One slow or broken provider must not block the
  others. Use `Promise.allSettled` semantics, and give each adapter an `AbortSignal` with a per-call
  timeout (default 4s).
- Each provider has a circuit breaker (defaults: 5 failures, 30s cooldown) that opens after N consecutive _retryable_ failures and
  half-opens after a cooldown. Breaker state lives in Redis so all instances share it.
  `ProviderError.retryable` decides what counts.
- `SearchResponse.providers` reports one `ProviderOutcome` per provider, and `isPartial` drives the
  "Some stores are unavailable" notice. A search returns an error page only when **every** provider
  fails and no cache exists.
- Never expose upstream error messages to the client. Use stable `errorCode`s only.

## Affiliate redirection

- `UnifiedProduct.productUrl` is always the **clean** canonical URL. Results never link to a store
  directly; every Go/View deal link is a signed `/go/{id}?d=…&s=…` href built in the composition
  root.
- The link is self-contained, so no lookup table is needed:
  - `d` is base64url JSON `{ v, p: provider, u: cleanUrl }`;
  - `s` is HMAC-SHA256 over `"{id}.{d}"`, keyed with `OUTBOUND_LINK_SECRET`;
  - because the id is inside the MAC, a payload can't be replayed under another product.
- `/go/[id]` (`src/app/go/[id]/route.ts`) delegates to `createResolveOutboundLink()`, which runs
  these steps in order:
  1. verify the signature (constant-time comparison);
  2. check the destination with `parseAllowedStoreUrl()` (https only, no credentials, no port,
     host must be on `STORE_HOSTS`);
  3. add the affiliate tag;
  4. check the tagged URL against the allowlist again;
  5. record the click;
  6. return a 302 with `no-store`, `noindex` and `Referrer-Policy: no-referrer`.

  Any failure returns a 404, never a redirect.

- `STORE_HOSTS` (`src/domain/affiliate/store-hosts.ts`) is security-critical; adding a domain
  needs a test in `store-hosts.test.ts`.
- `AffiliateLinkBuilder.build()` is async and never throws. On any failure it returns the clean
  URL with `affiliated: false`, so a tagging problem costs commission, never the click. Current
  coverage:
  - **Amazon** adds `tag`.
  - **eBay** adds the EPN params (US rotation id `711-53200-19255-0`). The eBay adapter also sends
    `affiliateCampaignId` in `X-EBAY-C-ENDUSERCTX`. eBay's docs say commission requires the
    `itemAffiliateWebUrl` URL, so confirm attribution in the EPN dashboard after the first live
    clicks.
  - **AliExpress** calls `aliexpress.affiliate.link.generate` at click time
    (`aliexpress-link-generator.ts`). It has a 1.5-second timeout and caches results in Redis for
    30 days.
  - **Temu** has no documented URL parameter, so it passes through untagged. Don't guess parameters.
- The URL-parameter builders are pure functions that keep other params, replace an existing tag and
  never double-encode.
- Click recording must never block or break the redirect.

---

## Testing mandates

**Every new feature ships with tests in the same PR.** Coverage below the thresholds in
`jest.config.mjs` fails `npm run check`: 90% statements, functions and lines, and 85% branches,
measured over `domain/`, `application/` and `infrastructure/`.

| Layer                        | What to test                                                                                                                                                               | How                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `domain/`                    | Every pure function, every branch. Landed-price math at thresholds. Sort stability and ties.                                                                               | Plain Jest, no mocks                             |
| `infrastructure/providers/*` | Raw→Unified mapping from **recorded fixtures**: happy path, missing optional fields, malformed payload → `parse_error`, HTTP 429/5xx/timeout → correct `ProviderErrorKind` | Mock `fetch` only. Never hit the network         |
| `infrastructure/affiliate/*` | Tag injection, existing params kept, existing tag replaced, host allowlist                                                                                                 | Plain Jest                                       |
| `application/`               | Fan-out with one provider failing, all failing, cache hit/miss, circuit open, sort/filter/pagination                                                                       | Fake `ProductSearchProvider` and in-memory cache |
| Components                   | Rendering of prices/badges, empty/partial/error states, keyboard interaction                                                                                               | RTL with `getByRole`, no snapshot-only tests     |
| E2E                          | Search → results → compare sheet → Go redirect; homepage feed; partial-outage banner                                                                                       | Playwright against mocked providers              |

Rules:

- Tests sit next to the code as `foo.test.ts(x)`. E2E specs go in `e2e/`.
- `*.test.ts` runs in the Node environment (real `fetch`, `Response`, `AbortSignal`), and
  `*.test.tsx` runs in jsdom.
- Never use `instanceof` on errors that come from `fetch` or other platform APIs, because they can
  come from another realm. Check `signal.aborted` or the error's `name` instead.
- Bug fixes start with a failing test that reproduces the bug.
- Do not use real API keys or network calls in unit tests. Fixtures are trimmed real responses with
  personal data removed.
- Query by role or label in RTL. `data-testid` is a last resort.
- Do not weaken a test or a coverage threshold to make CI pass.

---

## Onboarding a new provider (adapter checklist)

Example: adding `shein`.

1. **Register the ID.** Add `"shein"` to `PROVIDER_IDS` in `src/domain/shared/provider.ts`. The type
   checker then flags every exhaustive `switch` that needs a case.
2. **Create the folder** `src/infrastructure/providers/shein/`:
   ```
   shein-raw-schema.ts      Zod schema of the upstream payload (only the fields we read)
   shein-mapper.ts          pure: (raw, fx, importPolicy, now) → UnifiedProduct
   shein-adapter.ts         implements ProductSearchProvider: HTTP call, timeout, error mapping, calls mapper
   shein-mapper.test.ts
   shein-adapter.test.ts
   fixtures/                search-ok.json, search-empty.json, search-malformed.json
   ```
3. **Raw schema first.** Parse the upstream response with Zod. A parse failure becomes
   `err({ kind: "parse_error", retryable: false })` and never a throw.
4. **Keep the mapper pure.** It takes no I/O, no `Date.now()` and no env. Pass the clock, FX rate and
   import policy in as arguments. It must:
   - build `id` with `unifiedProductId(provider, providerProductId)`;
   - convert prices with `moneyFromMajor` and compute `LandedPrice` through the shared calculator;
   - store a clean `productUrl` with affiliate and tracking params removed;
   - map ratings to the 0–5 scale and delivery to business days, using `null` when unknown;
   - drop items with no price or no URL instead of inventing values.
     Reference implementations:
     - `src/infrastructure/providers/aliexpress/`: official API, with a shared signed gateway in
       `aliexpress-gateway.ts`;
     - `src/infrastructure/providers/amazon/`: SerpApi, with free-text delivery parsing;
     - `src/infrastructure/providers/ebay/`: official Browse API, with an OAuth client-credentials
       token cache and a single retry on 401.

     Compute delivery windows with `businessDaysUntil()` from `@/domain/shared/business-days`.
5. **The adapter maps errors as follows.**
   - 401/403 → `unauthorized`, not retryable.
   - 429 → `rate_limited`, retryable.
   - 5xx or network → `upstream_error`, retryable.
   - Abort → `timeout`, retryable.
   - The adapter respects `options.signal`, adds its own `AbortSignal.timeout`, and never throws.
   - A non-JSON body → `parse_error`. Every item invalid → `parse_error` (`ALL_ITEMS_INVALID`),
     because a contract change must not look like "0 results". Individual bad items are dropped.
6. **Affiliate builder.** Add `src/infrastructure/affiliate/shein.ts`, plus its host allowlist and tests.
   Some stores (AliExpress) issue affiliate links only through their API (`link.generate`). Never
   store a store-provided `promotion_link` on the product; generate it at redirect time and cache
   it under its own key.
7. **Config.** Add the API key and affiliate tag to `serverEnvSchema` in `src/config/env.ts` and to
   `.env.example`. A missing key disables the provider (status `skipped`) and does not crash the app.
8. **Images.** Add the provider's image CDN host to `images.remotePatterns` in `next.config.ts`.
9. **Wire it up.** Register the adapter in the composition root.
10. **UI.** Add the store's label and logo chip used on the compare sheet.
11. **Verify.** Run `npm run check` and confirm the coverage for the new folder is at least 90%.

---

## Environment and secrets

- Copy `.env.example` to `.env.local`. Never commit `.env*` files; `.env.example` is the exception.
- Every variable is optional in development, and the app degrades: no Redis means no cache, and a
  missing provider key means that provider is skipped. An empty value (`KEY=`) counts as unset.
- `ONECART_DEMO_PROVIDERS=true` replaces every store with the sample catalog in
  `src/infrastructure/providers/demo/`, priced at fixed exchange rates. The UI shows a "Demo data"
  badge. Use it for local development and E2E only, **never in production**.
- Only `NEXT_PUBLIC_*` values may reach the browser. Supabase's secret key is server-only.
- Supabase:
  - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` drive user requests,
    under RLS.
  - `SUPABASE_SECRET_KEY` is used only by the price checker. Never pass it to a request-scoped
    client.
  - `CRON_SECRET` (at least 16 chars) protects the cron route.
- `OUTBOUND_LINK_SECRET` (at least 32 chars, the same on every instance) is **required in
  production**, and the app refuses to start search without it. Dev and demo fall back to a
  per-process key. Rotating it breaks `/go` links in pages that are already open.
- eBay credentials: `EBAY_APP_ID` + `EBAY_CERT_ID` (the portal's names) or `EBAY_CLIENT_ID` +
  `EBAY_CLIENT_SECRET`; `ebayCredentials()` reads either. Dev ID isn't needed. A new **Production
  keyset stays disabled** (OAuth answers `invalid_client`) until the Marketplace Account Deletion
  notification is set up or an exemption is granted in the developer portal.
- SerpApi puts the API key in the query string. Never log request URLs from the Amazon adapter.

## Definition of done

1. `npm run check` is green. Run `npm run test:e2e` as well when you touched UI or routes.
2. New behaviour has tests at the right layer (see the table above).
3. No `any`, no unchecked casts, no `console.log`, no hardcoded secrets, prices or tax values.
4. UI changes are checked at a 375px width, with a screenshot, in light and dark mode.
