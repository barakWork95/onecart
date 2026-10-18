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
  Product photos go through `ProductImage`: served `unoptimized` straight from the store CDN, which
  already sizes them (eBay is asked for its 500px rendition). It shows a placeholder when a photo is
  missing or fails to load. Routing every product photo through the optimizer counted each one
  against the host's quota.

### Languages (English and Hebrew)

- **Routing.** Every page lives under `app/[lang]` (`en`, `he`); `[lang]/layout.tsx` is the root
  layout and sets `<html lang dir>`. English keeps its unprefixed URLs through `next.config`
  rewrites (`/c/x` → `/en/c/x`; listed explicitly so `/api`, `/go`, `/internal` and metadata
  files never match), and `/en/…` 308s to the unprefixed URL. Hebrew is `/he/…`. `/internal`
  has its own root layout; unmatched URLs render `app/global-not-found.tsx`
  (`experimental.globalNotFound`). Don't add `dynamicParams` (incompatible with Cache Components).
- **The language** comes from `currentLocale()` / `getDictionary()` (`src/i18n/server.ts`, via
  `next/root-params`) in Server Components; never in route handlers (use `src/i18n/enabled.ts`).
  `usePathname()` reports the rewritten `/en/…` path: compare paths with `splitLocale()`.
- **`HEBREW_UI`** switches the Hebrew interface on. Off (production until translated): the
  proxy answers `/he/…` with 404, and no switcher, hreflang or sitemap entry points to it. It's
  baked into prerendered pages at build time, so changing it needs a rebuild (Vercel redeploys
  on env changes). E2E runs with it on (`e2e/i18n.spec.ts`).
- **Text** lives in typed dictionaries (`src/i18n/dictionaries/`): `en.ts` defines the shape,
  every other language must match it (a missing key is a type error), and a test fails on
  untranslated strings. Counts are functions (Hebrew says "חנות אחת", "3 חנויות"). Pages read
  `currentLocale()` and pass `locale` down; components take a `locale` prop (default `en`) and
  use `dict(locale)`, `joinList()`, and `formatMoney(m, { locale })` / `formatSnapshotTime(iso,
locale)` (`he-IL`: "89 ₪"). Every internal link goes through `localizedPath(locale, path)`.
  Store titles are never translated; they get `dir="auto"` (`rtl:text-right`) so English reads
  left to right inside Hebrew pages. Amazon's Associates sentence stays in English everywhere;
  the legal pages are English only (Hebrew pages link to them with `hrefLang="en"`).
- **Server Actions answer in the page's language**: they can't read `[lang]`, so clients send
  `locale` with their input and `localeOf(input)` (`app/_action-locale.ts`) reads it (unknown →
  English); messages come from `dict(locale).actions`.
- **Notifications in the subscriber's language**: `push_subscriptions.locale` (`en`/`he`, default
  `en`) is saved with each browser (`NotifyMe` sends the page's locale); `alertMessage(alert,
locale)` writes the title, body and `/he/alerts` link in it. `Locale` itself lives in
  `domain/shared/locale.ts` (re-exported by `src/i18n/locales.ts`).
- **Hebrew suggestion.** English pages show a dismissible "OneCart זמין גם בעברית" note when
  the browser's first language is Hebrew (`LanguageSuggestion`, decided after mount); never a
  redirect.
- **SEO.** Indexable pages set `alternates: await pageAlternates(path)` (canonical, plus en/he/
  x-default hreflang when Hebrew is live); the sitemap lists each language with its alternates.
- **Fonts.** `--font-ui` is Plus Jakarta Sans, or Heebo on `:lang(he)` (Jakarta has no Hebrew).

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
- **Query intent (`src/domain/search/search-intent.ts`).** A query that names a product (a model
  code, or a brand plus words naming the line: "sony wh-1000xm5", "jbl flip 6", "airpods pro",
  "instant pot duo") splits results into tiers,
  under every sort: (0) listings naming that product, (1) related products, (2) accessories and
  parts. Within tier 0, best match puts cross-store comparisons first. Category queries
  ("wireless headphones") keep the stores' order. If the query asks for an accessory, the products
  themselves drop to tier 2.
  - `classifyOffers()` decides accessories per search with prices. The tokenizer gives a `strong`
    signal ("Earpads for Sony …", "Replacement …") or a `weak` one (an accessory word such as
    "case"). The typical price of clean listings of the named product settles the rest: a `weak`
    title under 50% of it, or a clean one under 30%, is a part; a "Hard Case … Headphones"
    listing at headphone prices is the headphones.
  - This orders results; it never drops them.
- **Stores that list an item but won't ship it to Israel.** With `shipping_location=IL`, Amazon
  returns such items with `no_featured_offers` and no price (confirmed for the Sony WH-1000XM5: its
  product page says it "cannot be shipped to your selected delivery location"). The adapter
  returns them as `ProviderPage.unavailable` (`UnavailableListing`). They're cached with the page
  and attached to the matching group (`ProductGroup.unavailable`), never as offers. The card says
  "Compared on 2 stores: eBay ₪X vs Amazon: no offer to Israel — Only eBay ships it to Israel",
  and the compare sheet lists the store with a View link. Never invent a price for them.
- **Never filter store results by the query text.** The store's own search decides what's relevant,
  synonyms included. Locally we only group, filter (by the user's explicit filters) and sort.
  - **One exception, AliExpress** (`LOOSE_SEARCH_STORES`, `isOffTopic`): for a query naming a
    specific product, its listings that don't name the product are dropped. It answers products it
    doesn't stock with anything sharing a word ("instant pot duo" → kitchen faucets). Accessories
    naming the product stay; category queries are untouched.
- **AliExpress strike-through prices are never kept** (`originalPrice: null`): its "was" prices
  are inflated (most listings claim 50–60% off), so no discount badge comes from them. Deals on
  OneCart come only from our own price history and cross-store savings.
- **A store can set its own deadline** with `ProductSearchProvider.timeoutMs`. Amazon/SerpApi
  takes about 3–4 seconds per page, so it gets 9 seconds; everything else keeps 4.
- **SerpApi quota (250 searches a month) — never spend it on development.**
  - `amazonSource()` picks Amazon's data: `live` only on Vercel production
    (`VERCEL_ENV=production`), `recorded` everywhere else (dev, tests, local production builds,
    previews). `SERPAPI_MODE=live|recorded` overrides it.
  - Recorded mode answers from `fixtures/recorded-*.json` via `createRecordedSerpApiFetch()`;
    unknown queries read as "no results". It's cached under `amazon@recorded` keys
    (`ProductSearchProvider.cacheScope`), so samples never pass for live prices, and the
    results page labels them "recorded samples, not live prices".
  - Jest blocks real calls to the stores' APIs (`src/test/no-live-apis.ts`).
  - Quota used up (live: HTTP 429, "Your account has run out of searches.") →
    `rate_limited` / `QUOTA_EXHAUSTED`, never cached; the circuit opens after a few. The page
    still renders the other stores. Every single-store card gets "Check Amazon": a signed `/go`
    link to Amazon's own search for the item (`storeChecks()`, `storeSearchUrl()`), affiliate
    tag added. The same applies to any failed store with a search page.
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
  - no conflict: different brands, model codes, variant values, series numbers, qualifiers, or
    tier words (`TIER_WORDS`: mini, pro, max, plus, ultra, lite, se; "Flip 6 Mini" ≠ "Flip 6");
  - not a branded AliExpress listing from a seller whose name lacks "official"
    (`isUnverifiedBrandListing`): knock-offs ("JBL Flip 6" from "JBL Pro Sound Store" at ₪149)
    keep their own card. Unbranded items and same-store collapsing are unaffected;
  - then one of: a shared model code with ≥ 50% containment (share of the shorter title found in
    the longer; Amazon titles run 3× longer than eBay's); a shared series number or generation of
    a branded item, no model codes, ≥ 80% containment; or ≥ 0.8 Dice title similarity
    (`title_similarity`). Accessories only get the last one: their model code names the product
    they fit. A model code on one side only, plus a brand, never matches.
- `src/domain/matching/fixtures/recorded-results.json` holds real Amazon + eBay results for seven
  queries; `recorded-results.test.ts` pins exactly which groups form. The previous matcher formed
  22 cross-store groups there, ~20 of them wrong. Re-record when tuning, and check every new group
  by hand.
- **One card per product, however many sellers.** A group holds every listing of the product
  (`listings`, cheapest first); `offers` is each store's cheapest, the per-store comparison.
  - Same-store listings collapse only via `matchSameStore()`: a shared long model code (6+ chars;
    colour suffixes like `wh1000xm5sa`/`-bnt` count as the same model, tier suffixes `ti`, `pro`,
    `max`… don't), a shared brand + series number, or near-identical branded titles. Accessories
    and generic look-alikes never collapse.
  - Linkage: nothing in the group may conflict with a newcomer (`blocksGrouping`: accessory vs
    product, price beyond 2.5× across stores or 3× within one, brand/model/variant/series/condition
    conflict), and it must match more than half the members (all of them when only titles match).
    A merge pass then joins clusters that placement order split, on the same rules.
  - **Card photo and title** (`hero-listing.ts`): a catalog store's photo first (Amazon's main
    image is product-only on white), including a "won't ship to Israel" Amazon listing of the
    same product; else the photo of the listing its store ranks best. The title comes from the
    most-reviewed listing, else the store's best match. Never just the cheapest seller's.
    Amazon thumbnails are requested at `_AC_SL500_`, eBay's at `s-l500`.
  - The card reads "eBay from ₪902 (18 listings) vs Amazon: no offer to Israel"; the compare sheet
    has an "All 18 eBay listings" tray under eBay's best offer. A single store with several
    listings opens a "18 eBay listings" sheet.
  - Add a test case to `product-matcher.test.ts` for every real mismatch you find. The four
    recorded live searches in `src/integration/recorded-searches.test.ts` ("sony wh-1000xm5",
    "jbl flip 6", "airpods pro", "instant pot duo") pin the end-to-end result.
- **Branded vs generic (dual-mode matching).** `searchIntent(...).mode` is `branded`
  when the query names a known brand or carries a model code, `generic` otherwise ("vegetable
  peeler", "car phone holder"); dimensions like `80x30` are specs, not model codes. A pair of
  listings is generic (`isGenericPair`, `pairMode`) only when neither names its **maker**
  (`TitleTokens.makers`: brands before "for/fits/compatible"; "Holder for iPhone 17 Samsung" is
  unbranded). Branded listings always keep the strict rules (brand verification, the brand's own
  store on AliExpress, the knock-off price guard).
  - `item-attributes.ts` reads stated quantities and colours, normalized (5M = 500cm = 16.4ft =
    5,000 mm; 1.5L = 1,500 ml; set of 4 = pack 4); `attributeConflict` is the generic veto (a 5 m
    and a 10 m strip differ). One side silent is no conflict; several colours conflict only if
    none matches.
  - A generic query that itself names an accessory-type item ("car phone holder", "led strip")
    doesn't demote listings for weak accessory words: they're the product. Strong signals
    ("Replacement clip for …") still do; generic category queries ("wireless headphones") demote
    cases as before.
  - **Photo hashes (Phase 2).** The warm-up hashes generic searches' photos (`photoUrlsToHash`,
    25 per store, ≤1,500 a run): dHash with `sharp` (borders trimmed, 9×8 greyscale), cached in
    Redis 30 days (`img:dhash:v1:{sha256(url)}`; failures 1 day). Photos come only from the
    allowlisted store CDNs (`image-fetcher.ts`: https, no redirects, 5 s, 2 MB). **Searches never
    compute a hash**: `photoHashesFor` reads cached ones, for generic intents only, and a failed
    read means "no photos".
  - **Generic matcher (Phase 3, `generic-matcher.ts`).** A generic pair matches **only** through
    `matchGeneric`, never the branded rules: unbranded titles carry format codes ("MP3",
    "QC3.0") that read as model numbers. Gates: (A) no `attributeConflict`; (B) photos within
    10 bits across stores, 6 within one; (C) ≥ 50% core-word containment; (D) item prices
    within 6×; (E) both accessories or neither. Tier words ("mini") don't conflict on generic
    pairs. Basis `visual_match` ("Looks identical"; compare-sheet caveat), joined by every
    member like `title_similarity`. No hashes → generic listings stay single cards.
  - `fixtures/generic-recorded.json` (10 queries, 449 eBay + AliExpress listings, hashed) and
    `generic-recorded.test.ts` pin the calibration: no cross-store photo within 8 bits, the
    only ≤ 12-bit pair is the same cable clip (9 bits), different products from 14; exactly one
    cross-store group (those clips) and 21 within-store collapses (reviewed by title, photo distance
    and price). Re-record and re-check when tuning.
  - **UI (Phase 4).** `ProductGroup.lookAlike` (any photo link, across stores or within one) →
    a "Looks identical · Best value" badge (`LOOK_ALIKE_BADGE`) on search, homepage and category
    cards; the compare sheet's caveat names up to three sellers (`matchCaveat(group)`), and the
    listings tray shows "Sold by …". A listing stating exactly one pack size ≥ 2 shows "₪3.20 per
    piece" (`unitPrice`; menus like "2/5PCS" never do). "Cheaper on another store" accepts photo
    matches, worded "Looks identical, ₪X less on AliExpress".
  - **Generic categories** (`Category.mode: "generic"`): kitchen-gadgets, car-accessories,
    desk-gadgets, ten commodity queries each; `categories.test.ts` checks every query reads as its
    category's mode. `/c` lists "Brands and models" and "Everyday gadgets" separately.
- **AliExpress seller verification** (`isUnverifiedBrandListing`): a branded AliExpress listing
  counts only from the brand's own store: the seller's name says Official or Flagship **and**
  names the listing's brand (aliases count). "Official" alone means official for the seller's own
  brand ("Geekria Official Store" lists Sony ear pads).
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
  every 6 hours. If the source is down, the last-known-good rates are used for up to 7 days. With
  none cached (a fresh instance during an outage), the static table in
  `src/config/fallback-fx-rates.ts` is used and the source retried at most every 5 minutes, so
  prices never fail on FX. Refresh that table every few months.
- An adapter that can't get rates returns a **non-retryable** `FX_UNAVAILABLE` error, so an FX
  outage never trips a store's circuit breaker.

## Wishlists, price alerts and Supabase

- **Schema.** Migrations live in `supabase/migrations/`, the Supabase CLI convention. Every table
  has row-level security, so users touch only their own rows; the service role (the price checker)
  is the only cross-user reader.
- **Schema changes.** Every change ships with assertions in `supabase/tests/*.test.sql`, and
  `npm run test:db` must pass. **Grant the service role explicitly in the migration** whenever
  it reads or writes a table (production's default privileges don't); tests never add grants
  themselves. Missing it once broke the price checker silently (`price_alerts`, fixed by
  `20261018120000_price_alerts_service_role.sql`). It applies the migrations to a throwaway Postgres with a minimal
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
- **Price-alert notifications (Web Push).** On when `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` are all set (`webPushConfig`); otherwise the switch is
  hidden and alerts work as before.
  - `NotifyMe` (Alerts page) asks for permission only on a tap; it registers `public/sw.js`
    (no caching, no fetch handler; clicks only open same-origin paths), subscribes with the
    VAPID key, and saves via `savePushSubscriptionAction`. iPhone needs the site added to the
    Home Screen (`app/manifest.ts`, standalone); the switch says so.
  - `push_subscriptions` is one row per user and endpoint (RLS). **Endpoints must be one of the
    major browsers' push services** (`isAllowedPushEndpoint`, checked in the action and by a
    database CHECK): the server POSTs to them, so any other host would be an SSRF hole.
  - The price-alerts cron runs `notifyTriggeredAlerts` after the check: triggered alerts with no
    `notified_at` are pushed to every browser their owner subscribed, then stamped (every trigger
    once; re-arming clears it). All sends failing → retried next run. 404/410 → subscription
    deleted; 5 failures in a row → deleted. No subscription, or triggered over 3 days ago →
    stamped without a push.
  - Headless Chromium reports `Notification.permission` as "denied" even when granted, so the
    "allowed" path is covered by `notify-me.test.tsx`, not E2E.
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
- Bump the `v3` segment in the key whenever the cached entry or `UnifiedProduct` shape changes.
  Deeper store pages add a `:pN` suffix.
- Never cache an error or an empty result from a failed call. Do cache a legitimate "0 results".
- If Redis is unavailable, log it and continue uncached. A cache outage must not break search.
  Without Upstash env vars, the composition root uses `createInMemoryRedis()`, which is
  per-instance only.
- The homepage deal feed reads Supabase and the Redis cache only. It must **never** trigger a live
  provider API call.
- **Homepage "Trending comparisons"** (`application/deals/trending-showcase.ts`): one card per
  product in `config/trending.ts`, built from **cached** results with the same
  `assembleResults()` the search page uses (so a card matches the comparison it links to); the
  card is the search's top non-accessory result. Nothing cached → no card. Each card shows when
  its prices were fetched ("Prices as of …", the oldest snapshot). Cards are memoized per
  instance for 5 minutes.
  - `/api/cron/warm-trending` (daily 07:30 UTC, after eBay's quota reset) re-runs those searches
    through the normal search path with `refresh` (skip the cache read, call, re-cache).
    Demo mode warms the demo catalog's `DEMO_TRENDING_QUERIES`.
    - `TRENDING_WARM_STORES` (default `ebay`: 5 calls a day) are refreshed for every query daily.
    - **Amazon is warmed on a rotation** (`rotationFor`, `domain/deals/warm-rotation.ts`):
      `AMAZON_WARM_PER_DAY` queries a day (default 2), each a `lean` page 1 (one SerpApi
      credit; reported as the last page, so warmed Amazon results don't "Load more"), cached
      for the rotation interval + 12h (`rotationTtlSeconds`: 5 queries at 2 a day → 3.5 days).
      eBay stays at the default 24h.
    - Warming has its **own Amazon counter** (`budget-warm:`, `warmSearchProducts` in the
      composition root), so it never spends shoppers' calls. Shoppers keep
      `AMAZON_DAILY_CALL_BUDGET` (default 3 calls × 2 pages). Total: 6 + 2 = 8 credits a day ≈
      248 a month, under the free plan's 250. Change both together.
- **Homepage category rows** (`config/categories.ts`, `categoryRows()` in the composition root): six
  branded categories × ten specific products (brand + model) and three generic ones × ten commodity
  items (`categories.test.ts` checks each query's mode, and that none repeats a trending one). Each card is built like a trending card,
  from cache only; empty rows are hidden. The warm-trending cron refreshes them after the trending
  queries, 3 at a time, on `TRENDING_WARM_STORES` (default `ebay,aliexpress`; ~95 calls a day
  each), and hashes the generic queries' photos (≤ 1,500 a run, cached 30 days). Amazon's rotation stays on the trending queries.
- **Category pages** (`/c`, `/c/[slug]`, for search engines): built only from cached results via
  `categoryPageData()` (`"use cache"`, `cacheLife("hours")`, tag `category:{slug}`), so a crawl never
  reaches Redis, let alone a store. Products are picked by `createFeaturedLookup`, the same as
  homepage cards, and `CategoryProductCard` shows the full landed-price breakdown.
  - The warm-up revalidates each tag; the first visit after it may still get the previous copy
    while it rebuilds (E2E polls for the fresh one).
  - Fewer than `MIN_INDEXABLE_PRODUCTS` (3) priced products → `noindex, follow` and left out of
    the sitemap. Unknown slugs get a real 404 from `src/proxy.ts` (the page's own `notFound()`
    would come after a streamed 200).
  - JSON-LD: `BreadcrumbList` + `ItemList` of names only, no prices (our landed price isn't the
    store's price). Category copy states no tax figures; `HowWePrice` reads them from the policy.
  - Linked from homepage "See all", the footer (`SiteFooter categories`), `/c` and the sitemap.
- **Price history and "Price drops"** (`price_observations`, `application/deals/price-history.ts`):
  after each warm run, the cron upserts one row per featurable, named-product listing per Israeli
  day (`observationsFrom`), prunes days older than 120, and checks each product's last 30 days.
  `detectPriceDrop` (domain) calls a drop only with ≥7 earlier days, a new 30-day low, and ≥15%
  and ≥₪20 under the median. Cards (max 12, 2 per search) go to Redis (`deals:price-drops:v1`,
  2-day TTL); the homepage reads only that. Visitors' searches are never recorded. Needs
  `SUPABASE_SECRET_KEY`; without it the run reports `not_configured`, and a failure never fails
  the warm-up.
- **"Cheaper on another store"** (`application/deals/savings.ts`): from the homepage's own
  trending and category cards, those priced on ≥2 stores and matched by **model number** (never
  title similarity), saving ≥₪20 and ≥10% against the next store. Store "was" prices never count
  as deals anywhere.
- **What a homepage card may feature** (`domain/deals/featured-listing.ts`): a card reads as an
  endorsement, so it's stricter than search. Marketplace listings must name a branded query's
  brand (catalog stores like Amazon are exempt: their titles drop it), branded AliExpress
  listings must come from an official store, the featured product's price must be within
  0.5–2× the median of listings naming it, and **its shipping must be quoted** (a card shows
  landed prices only; AliExpress's API never quotes shipping, so its listings stay in live
  search as "+ shipping" but don't make cards). This keeps clones ("BOROFONE … AirTag Compatible"
  ₪31) and outliers (a ₪3,304 air fryer) off the homepage. Search results are unaffected.
  - Results from an older snapshot are dated: `ProviderOutcome.cachedAt` (oldest cached page)
    → "Amazon prices as of 13 Oct, 10:30" above the cards when older than an hour.

## Abuse protection (store API quotas)

Every `/search` can call the stores' APIs, whose limits are shared by all shoppers (eBay Browse:
5,000 calls a day; SerpApi: 250 searches a month). On 2026-10-12 crawlers made 5,790 eBay calls
in a day and used up SerpApi's month, taking both stores down for everyone.

- `robots.txt` disallows `/search`, `/go/`, `/api/`; search pages are `noindex`.
- **Per-IP throttle** in `src/proxy.ts` (`_search-throttle.ts`): GET `/search?q=…` only, 20 a
  minute and 300 a day per IP by default (`SEARCH_RATE_LIMIT_PER_MINUTE` / `_PER_DAY`); over it →
  429 with `Retry-After`. Router prefetches are excluded by the proxy **matcher** (`missing`
  headers): Next strips `next-router-prefetch` from `request.headers`, so code can't see it.
- **Per-store daily budget** (`StoreCallBudget`, checked in the orchestrator after cache and
  circuit): eBay 4,500, Amazon 3 and AliExpress 2,000 live calls a day by default
  (`ALIEXPRESS_DAILY_CALL_BUDGET`) (`EBAY_DAILY_CALL_BUDGET`,
  `AMAZON_DAILY_CALL_BUDGET`). Over budget → that store reports `DAILY_BUDGET`, the circuit is
  untouched, and the UI offers "Check <store>" links. This stops floods from rotating IPs.
- Local runs may share production Redis (`.env.local` holds the `KV_*` vars). Non-live data is
  always cache-scoped (`amazon@recorded`, `<store>@demo`), E2E blanks every Redis variable, and
  requests without a client IP (local runs) aren't throttled.
- Counters are fixed windows in Upstash (`createUpstashCounterStore`), per-instance in memory
  without it. Production's database is Vercel Storage `onecart-redis`, which injects
  `KV_REST_API_URL` / `KV_REST_API_TOKEN`; `parseServerEnv()` maps them onto
  `UPSTASH_REDIS_REST_*` when that pair is unset, so every Redis user finds it. A counter outage allows the request: the limiter must never take the site down.
- Check eBay's usage: `GET https://api.ebay.com/developer/analytics/v1_beta/rate_limit/?api_context=buy&api_name=browse`
  (client-credentials token); it reports count, remaining and the reset time.

## Share previews and sitemap

- `SITE_URL` (`src/config/site.ts`) is `https://www.onecartapp.com`; the apex redirects there.
  The root layout sets `metadataBase`, Open Graph and `summary_large_image` Twitter tags.
- `app/opengraph-image.tsx` and `app/twitter-image.tsx` render `_share-card.tsx` at build time
  (static). The logo is inlined there; a test keeps it equal to `app/icon.svg`.
- `sitemap.ts` lists only static pages; never add `/search` URLs (they spend store quota).

## Operations: /internal/status and ops alerts

- Both crons run through `recordCronRun` (`application/ops`): each run is stored in Redis
  (`ops:cron:v1:{job}`: last run and last ok run) with plain-language problems from
  `warmRunProblems` / `alertRunProblems` (a store failing ≥50% of its searches, price history or
  notifications erroring, failed alert searches). A throwing run is recorded, then rethrown.
- `/internal/status` (admin password, like `/internal/clicks`): current problems, each job's last
  and last ok run, quotas, price rows per day (14 days), push and alert counts, clicks today.
  Quotas cost nothing to read: SerpApi's account endpoint, eBay's rate-limit analytics, and our
  own budget counters (`budget:day:{store}:{day}`, `budget-warm:…`) read directly.
- **Ops alerts** (`createCheckOpsAlerts`, after every cron run): issues = failing last runs, missed
  runs (a recorded job over 26h old; each cron checks the other), quotas at zero. Only changes
  push: new issues once, then "recovered". If every push failed, nothing is marked alerted, so
  the next run retries. Targets are admin browsers in Redis (`ops:alerts:targets:v1`), added
  with the status page's switch; turning it off keeps the browser's own subscription.

## Compliance

- The footer on every page carries the general affiliate disclosure (`AFFILIATE_DISCLOSURE`:
  eBay Partner Network, Amazon Associates and the AliExpress Affiliate Program) and Amazon's exact sentence
  (`AMAZON_ASSOCIATES_DISCLOSURE`; keep the wording), plus links to `/privacy` and `/terms`.
- `/privacy` and `/terms` describe what the app actually does (anonymous accounts, IP rate
  limiting, 24h query cache, click logging, the processors). Update them when that changes, and
  bump `LEGAL_LAST_UPDATED`. `CONTACT_EMAIL` adds the contact line; without it the line is
  left out rather than showing a placeholder.

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
  5. record the click, after the 302 is sent (`defer: after`), so analytics never delays it;
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
  - `SupabaseClickRecorder` appends to `outbound_clicks` (product id, store, `affiliated`, time;
    nothing identifying) with a 2-second timeout. Without `SUPABASE_SECRET_KEY` clicks go to the
    logs (`consoleClickRecorder`).
  - The table has RLS and no policies: only the service role writes or reads it. The
    `outbound_clicks_daily` view counts per **Israeli** day and store.
  - `/internal/clicks` shows the last 30 days per store and per day, with the affiliate-tagged
    share. HTTP Basic: any user name, password `ADMIN_DASHBOARD_PASSWORD` (checked in
    `src/proxy.ts` and again in the page). Unset → 404. `robots.txt` disallows `/internal`.
- **Every outbound anchor spreads `OUTBOUND_LINK`** (`src/components/features/outbound-link.ts`):
  `target="_blank"` and `rel="nofollow sponsored noopener noreferrer"`. Never hand-write these.
  The E2E "affiliate & conversion audit" follows every `/go` link on a page (cards, compare
  sheet, listings tray, 60 Load-more cards) and checks Amazon's `tag` and eBay's
  `campid`/`toolid`/`mkrid` on the 302.
- Outbound buttons are at least 44px tall (touch-target guideline); the compare sheet's title is
  clamped to 2 lines on phones so the offers stay above the fold.

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
  - `SUPABASE_SECRET_KEY` is used only by the price checker and the click log/report. Never pass
    it to a request-scoped client.
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
