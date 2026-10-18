import type { Metadata } from "next";
import { pageAlternates } from "@/i18n/server";
import Link from "next/link";
import { ContactLine, LegalPage } from "@/components/features/legal/legal-page";
import { AMAZON_ASSOCIATES_DISCLOSURE } from "@/components/layout/site-footer";
import { env } from "@/config/env";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Terms of Use",
    description: "The terms for using OneCart's price comparison service.",
    alternates: await pageAlternates("/terms"),
  };
}

export default function TermsPage() {
  const email = env().CONTACT_EMAIL;
  return (
    <LegalPage
      title="Terms of Use"
      intro="These terms apply to your use of OneCart (onecartapp.com). By using the site you agree to them. If you don't agree, please don't use it."
    >
      <section>
        <h2>What OneCart is</h2>
        <p>
          OneCart is a price comparison service. We show products and offers from third-party stores such as
          eBay, Amazon and AliExpress, with an estimate of the total cost of getting each item to Israel. We
          don&apos;t sell products, take orders or handle payments. When you buy, you buy from the store,
          under the store&apos;s own terms, prices, shipping, returns and warranty.
        </p>
      </section>

      <section>
        <h2>Prices and landed-cost estimates</h2>
        <ul>
          <li>
            Prices, availability and delivery times come from the stores and can change at any moment. Prices
            we show may be up to a few days old; we show when older prices were checked. The store&apos;s
            checkout is always the final price.
          </li>
          <li>
            Import VAT, customs duty and fees are our estimates under the Israeli import rules as we
            understand them. They aren&apos;t tax advice; the amount you&apos;re actually charged is set by
            the store, the carrier and the Israel Tax Authority.
          </li>
          <li>
            We group listings we believe are the same product. Matching is automatic and can be wrong; check
            the listing before you buy.
          </li>
        </ul>
      </section>

      <section>
        <h2>Affiliate relationships</h2>
        <p>
          OneCart participates in affiliate programs, including the eBay Partner Network, Amazon Associates
          and the AliExpress Affiliate Program. We may earn a commission when you buy through our links, at no
          additional cost to you. Commissions never change the prices we show or how we rank offers: results
          follow the stores&apos; own relevance and the landed price. {AMAZON_ASSOCIATES_DISCLOSURE}
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>Please don&apos;t:</p>
        <ul>
          <li>access OneCart with bots, scrapers or other automated means, or run searches in bulk;</li>
          <li>try to bypass our rate limits or interfere with the site or the services it relies on;</li>
          <li>copy or redistribute our listings and prices as a dataset.</li>
        </ul>
        <p>We may limit or block access that breaks these rules.</p>
      </section>

      <section>
        <h2>Trademarks and content</h2>
        <p>
          Product names, images and descriptions belong to their owners and are shown to help you compare.
          eBay and the eBay logo are trademarks of eBay Inc. Amazon and the Amazon logo are trademarks of
          Amazon.com, Inc. or its affiliates. AliExpress is a trademark of Alibaba Group. OneCart is not
          affiliated with, sponsored by or endorsed by eBay, Amazon, AliExpress or any other store, beyond the
          affiliate programs described above.
        </p>
      </section>

      <section>
        <h2>No warranty; liability</h2>
        <p>
          OneCart is provided &quot;as is&quot;. We work to keep it accurate and available but can&apos;t
          guarantee that prices, estimates or matches are complete, current or error-free, or that the site
          will be uninterrupted. To the extent the law allows, we aren&apos;t liable for losses arising from
          your use of the site or from purchases you make from stores.
        </p>
      </section>

      <section>
        <h2>Privacy</h2>
        <p>
          How we handle data is described in our <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </section>

      <section>
        <h2>Changes and law</h2>
        <p>
          We may update these terms; the date above shows the latest version. These terms are governed by the
          laws of the State of Israel.
        </p>
        <ContactLine email={email} purpose="questions about these terms" />
      </section>
    </LegalPage>
  );
}
