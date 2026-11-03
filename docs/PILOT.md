# Headphones pilot — working board

Owner: Codex. Business scope approved by the product owner on 2026-11-03.
No new paid service has been purchased.

## Approved outcome

15–20 named headphone models, two verified stores, transparent estimates for delivery to Israel.
No Temu integration or additional category work during this pilot. Candidate models live in
`src/config/pilot.ts`; new standalone pairs only. Match model, colour, generation, regional SKU and
bundle before an offer is admitted to the validation sheet. A catalog entry is not a verified offer.

## Board

| ID  | Task                                                 | Status                                       | Done means                                                                                                      |
| --- | ---------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| P01 | Candidate catalog and scope                          | Implemented, staged                          | 15 distinct model queries; headphones-only discovery behind `ONECART_HEADPHONES_PILOT`                          |
| P02 | Partial-cost ranking and claims                      | Implemented, local checks passed             | Quoted shipping first; no best-price badge, premium or best-deal tracking when any compared shipping is unknown |
| P03 | Preserve eBay variation                              | Implemented, local checks passed             | Same variation ID survives mapper and affiliate URL generation                                                  |
| P04 | Nearby affiliate disclosure and estimate wording     | Implemented, local checks passed             | English/Hebrew disclosure by offer CTAs and in comparison sheet; estimate wording                               |
| P05 | Automated quality gate                               | Local checks passed; GitHub run pending      | Types, lint, coverage, demo browser and throwaway SQL jobs pass                                                 |
| P06 | Confirm two store accounts, rights and attribution   | Awaiting owner decision/account verification | Approved domains/methods, usable credentials, traceable test click, permitted data use                          |
| P07 | Validate matching and landed costs                   | Pending P06                                  | 50 labelled pairs and 20 aligned Israel checkout comparisons, actual evidence recorded                          |
| P08 | Strict provider spend control, freshness and privacy | Pending                                      | Monthly credit cap, shared-counter failure stops paid calls, stale quotes cannot win, analytics redaction       |
| P09 | Preview, mobile/RTL review and production release    | Pending checks                               | Preview verified, no production demo data, deployment SHA known and rollback available                          |
| P10 | Limited user test                                    | Not started                                  | 10–20 testers; at least 30 useful searches; funnel and attributed revenue measured                              |

## Release gates

Do not enable the pilot flag in production yet. It narrows discovery/categories/warming only;
it does not restrict arbitrary search queries, validate store rights or ensure two-store coverage.
The demo catalog takes precedence so routine E2E remains deterministic.

Before external launch: at least 70% of models have comparable offers in two approved stores;
zero critical false matches in a 50-pair labelled set; at least 90% of 20 checkout comparisons
within max(5%, ₪10) for known costs; missing future carrier/import fees never count as verified.
Complete browser/SQL checks, verify mobile light/dark/RTL, test store attribution, observe 3
successful daily cron runs, and configure spending caps. Do not buy traffic or another data plan
until these gates pass. Existing broad catalog remains available with the flag off.

## Amazon decision under review

The owner wants Amazon included and requested a cost/constraint comparison on 2026-11-03.
Do not remove Amazon or switch live providers while this decision is pending. The earlier
recommendation to launch with eBay/AliExpress was not approved. Prepare an official Creators API
path, a temporary link-only path and the current SerpApi development-only cost comparison.
The owner confirmed an existing Associates account; API eligibility is still unknown. No paid plan or production setting has changed.

Amazon official policy was successfully retrieved on 2026-11-03 after the first audit:
https://affiliate-program.amazon.com/help/operating/policies
Participation Requirements section 2 requires prices from Amazon-served links or Creators/PA API;
section 6(y) requires agreement for price tracking/alerts. License terms also restrict using Amazon
content to promote other retailers. Current SerpApi, hero-image and alert paths require review.
Creators API prerequisites currently include 10 qualifying sales in 30 days:
https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction
No Amazon application or external message has been sent.

## Work log

2026-11-03: Created isolated branch `codex/headphones-pilot` from local commit `166fc9b`.
No production secrets copied into the development checkout. Source desktop clone remains unchanged.
Implementation and test results will be recorded here before the first review handoff.

Local validation (2026-11-03): TypeScript and ESLint passed; 163 Jest suites / 1,357 tests passed
with the coverage gate. Production demo build and 146 desktop/mobile Playwright checks passed.
All throwaway PostgreSQL migration/RLS tests passed. Remote main was fetched and matches base
166fc9b. No production deployment or live provider call has been performed.

Rollout note: existing cached eBay product URLs and already-signed links can omit a variation
until refreshed. Refresh/expire the affected eBay cache before declaring the URL fix live; do
not delete unrelated production data. This is not needed for the isolated demo preview.
