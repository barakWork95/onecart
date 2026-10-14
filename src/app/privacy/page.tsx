import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, LegalPage } from "@/components/features/legal/legal-page";
import { env } from "@/config/env";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What OneCart collects, why, who processes it and how long it's kept.",
};

export default function PrivacyPage() {
  const email = env().CONTACT_EMAIL;
  return (
    <LegalPage
      title="Privacy Policy"
      intro="OneCart (onecartapp.com) compares product prices across online stores for shoppers in Israel, including shipping, import VAT and duty. We collect as little as we can to do that. This policy explains what we collect, why, who helps us process it, and your choices."
    >
      <section>
        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Your searches.</strong> The text you search for is sent to the stores&apos; product search
            services to find offers. Results are cached for up to 24 hours by the search text, not by who
            searched, so the next shopper gets them faster.
          </li>
          <li>
            <strong>Technical data.</strong> Our hosting provider receives your IP address and browser details
            with every request, as any website does. We use your IP address to limit how many searches one
            connection can run (to protect the stores&apos; services from automated traffic); those counters
            expire within a day.
          </li>
          <li>
            <strong>Saved items and price alerts.</strong> If you save a product or set a price alert, we
            create an anonymous account for your browser (no name, email or password) and store the products
            and target prices you chose. A cookie keeps you signed in to that anonymous account.
          </li>
          <li>
            <strong>Store visits.</strong> When you follow a link to a store, we record which product and
            store it was, whether it carried our affiliate identifier, and when, without anything that
            identifies you, to understand which comparisons are useful. This is counted on our server when the
            link is followed; no cookies or tracking scripts are involved, and no IP address, account or
            session is stored with it.
          </li>
          <li>
            <strong>Preferences.</strong> Your light or dark theme choice is kept in your browser&apos;s local
            storage and never sent to us.
          </li>
        </ul>
        <p>We don&apos;t sell personal data, and we don&apos;t use advertising or analytics cookies.</p>
      </section>

      <section>
        <h2>Affiliate links and the stores you visit</h2>
        <p>
          OneCart participates in affiliate programs, including the eBay Partner Network, Amazon Associates
          and the AliExpress Affiliate Program. Links to stores pass through our redirect, which adds our
          affiliate identifier so the store can credit us if you buy; this costs you nothing. Once you reach a
          store, its own privacy policy and cookies apply, including cookies the store or its affiliate
          program uses to attribute your purchase. We don&apos;t receive your purchase or payment details.
        </p>
      </section>

      <section>
        <h2>Who processes data for us</h2>
        <ul>
          <li>Vercel, which hosts the site.</li>
          <li>Upstash, which stores the search cache and the rate-limit counters.</li>
          <li>
            Supabase, which stores anonymous accounts, saved items, price alerts and the store-visit counts.
          </li>
          <li>
            eBay (Browse API), SerpApi (for Amazon results) and AliExpress (Affiliate API), which receive your
            search text to return products. When you follow a link to AliExpress, its Affiliate API also
            receives that product&apos;s address to create our tracked link.
          </li>
          <li>DeepL, if enabled, which receives Hebrew search text to translate it.</li>
          <li>Frankfurter (European Central Bank rates), for exchange rates; no personal data is sent.</li>
        </ul>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <ul>
          <li>Cached search results: up to 24 hours.</li>
          <li>Rate-limit counters: up to one day.</li>
          <li>Store-visit records: kept to follow trends over time; they contain no personal data.</li>
          <li>Saved items and price alerts: until you delete them, which you can do on those pages.</li>
          <li>Hosting logs: as long as our hosting provider retains them.</li>
        </ul>
      </section>

      <section>
        <h2>Your choices and rights</h2>
        <p>
          You can use OneCart without saving anything. You can delete saved items and alerts at any time from{" "}
          <Link href="/saved">Saved</Link> and <Link href="/alerts">Alerts</Link>, and clear our cookie in
          your browser settings. Depending on where you live, including under Israel&apos;s Protection of
          Privacy Law, you may have the right to access, correct or delete personal data we hold about you.
        </p>
        <ContactLine email={email} purpose="privacy questions or requests" />
      </section>

      <section>
        <h2>Children</h2>
        <p>OneCart is not directed at children under 16, and we don&apos;t knowingly collect their data.</p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          If we change this policy, we&apos;ll update it here and change the date above. Material changes will
          be highlighted on the site.
        </p>
      </section>
    </LegalPage>
  );
}
