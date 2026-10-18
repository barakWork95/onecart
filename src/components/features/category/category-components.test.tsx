import { render, screen, within } from "@testing-library/react";
import type { CategoryProduct } from "@/application/deals/category-page";
import { Breadcrumbs } from "@/components/features/category/breadcrumbs";
import { CategoryProductCard } from "@/components/features/category/category-product";
import { HowWePrice } from "@/components/features/category/how-we-price";
import { ISRAEL_IMPORT_POLICY } from "@/config/israel-import-policy";
import { money } from "@/domain/shared/money";

const ils = (shekels: number) => money(Math.round(shekels * 100), "ILS");

const PRODUCT: CategoryProduct = {
  label: "JBL Charge 5",
  query: "jbl charge 5",
  title: "JBL Charge 5",
  imageUrl: null,
  best: { provider: "ebay", total: ils(612.12) },
  stores: [
    { provider: "ebay", total: ils(612.12), shippingKnown: true, listings: 4 },
    { provider: "aliexpress", total: ils(689), shippingKnown: true, listings: 1 },
  ],
  unshippedStores: ["amazon"],
  matchedBy: "model_number",
  lookAlike: false,
  unitPrice: null,
  pricesAsOf: "2026-10-18T04:30:00.000Z",
  bestListing: {
    id: "ebay:1",
    provider: "ebay",
    title: "JBL Charge 5 Portable Waterproof Speaker — Black",
    productUrl: "https://www.ebay.com/itm/1",
    price: {
      item: ils(450),
      shipping: ils(68.75),
      shippingKnown: true,
      importVat: ils(93.37),
      customsDuty: ils(0),
      fees: ils(0),
      total: ils(612.12),
      taxesCollectedAtCheckout: false,
      listed: ils(450),
      fxRate: 1,
    },
  },
};

describe("CategoryProductCard", () => {
  it("badges a photo-matched product and prices a multi-pack per piece", () => {
    const clips: CategoryProduct = {
      ...PRODUCT,
      label: "Magnetic cable clips",
      query: "magnetic cable clips",
      matchedBy: "visual_match",
      lookAlike: true,
      unitPrice: { pack: 10, perUnit: ils(3.2) },
    };
    render(<CategoryProductCard product={clips} goHref="/go/x" />);
    const card = screen.getByRole("article", { name: "Magnetic cable clips" });
    expect(within(card).getByText("Looks identical · Best value")).toBeInTheDocument();
    expect(card).toHaveTextContent("₪3.20 per piece");
  });

  it("shows the landed price, its breakdown, every store, and both links", () => {
    render(<CategoryProductCard product={PRODUCT} goHref="/go/ebay%3A1?d=x&s=y" />);
    const card = screen.getByRole("article", { name: "JBL Charge 5" });
    expect(card).toHaveTextContent("₪612landed on eBay");

    const breakdown = within(card).getByLabelText("Price breakdown on eBay");
    expect(breakdown).toHaveTextContent(
      "Item₪450.00Shipping to Israel₪68.75Import VAT (estimated)₪93.37Customs duty₪0.00Total₪612.12",
    );
    expect(within(card).getByRole("list", { name: "Every store" })).toHaveTextContent(
      "eBay ₪612AliExpress ₪689Amazon: no offer to Israel",
    );
    expect(within(card).getByRole("link", { name: /Compare every store/ })).toHaveAttribute(
      "href",
      "/search?q=jbl+charge+5",
    );
    const go = within(card).getByRole("link", { name: /View on eBay/ });
    expect(go).toHaveAttribute("href", "/go/ebay%3A1?d=x&s=y");
    expect(go).toHaveAttribute("rel", "nofollow sponsored noopener noreferrer");
  });

  it("says when shipping isn't quoted or taxes are charged at checkout", () => {
    const { price } = PRODUCT.bestListing;
    render(
      <CategoryProductCard
        product={{
          ...PRODUCT,
          stores: [PRODUCT.stores[0]!],
          unshippedStores: [],
          bestListing: {
            ...PRODUCT.bestListing,
            price: {
              ...price,
              shippingKnown: false,
              shipping: ils(0),
              taxesCollectedAtCheckout: true,
              fees: ils(12),
            },
          },
        }}
        goHref="/go/x"
      />,
    );
    const card = screen.getByRole("article");
    expect(card).toHaveTextContent("+ shipping on eBay");
    expect(card).toHaveTextContent("Shipping to IsraelNot quoted");
    expect(card).toHaveTextContent("Import VAT (charged at checkout)");
    expect(card).toHaveTextContent("Fees₪12.00");
    expect(within(card).queryByRole("list", { name: "Every store" })).not.toBeInTheDocument();
  });
});

describe("HowWePrice", () => {
  it("states the thresholds from the import policy itself", () => {
    render(<HowWePrice policy={ISRAEL_IMPORT_POLICY} />);
    const section = screen.getByRole("region", { name: "How we compare prices" });
    expect(section).toHaveTextContent("import VAT of 18% on orders over $75");
    expect(section).toHaveTextContent("customs duty on orders over $500, estimated at 12%");
  });
});

describe("Breadcrumbs", () => {
  it("links the trail and marks the current page", () => {
    render(
      <Breadcrumbs
        crumbs={[{ label: "Home", href: "/" }, { label: "Categories", href: "/c" }, { label: "Kitchen" }]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByRole("link", { name: "Categories" })).toHaveAttribute("href", "/c");
    expect(within(nav).getByText("Kitchen")).toHaveAttribute("aria-current", "page");
  });
});

describe("category components in Hebrew", () => {
  const plain = (s: string | null) => (s ?? "").replace(/‏/g, "").replace(/ /g, " ");

  it("break the landed price down in Hebrew, number-first, linking within /he", () => {
    render(<CategoryProductCard product={PRODUCT} goHref="/go/x" locale="he" />);
    const card = screen.getByRole("article", { name: "JBL Charge 5" });
    const breakdown = within(card).getByLabelText("פירוט המחיר ב-eBay");
    expect(within(breakdown).getByText("משלוח לישראל")).toBeInTheDocument();
    expect(within(breakdown).getByText("סה״כ")).toBeInTheDocument();
    expect(plain(card.textContent)).toContain("612 ₪");
    expect(card).toHaveTextContent("מחיר סופי ב-eBay");
    expect(
      within(card)
        .getByRole("link", { name: /השוואה בכל החנויות/ })
        .getAttribute("href"),
    ).toMatch(/^\/he\/search\?/);
  });

  it("explain the landed price in Hebrew with the policy's own figures", () => {
    render(<HowWePrice policy={ISRAEL_IMPORT_POLICY} locale="he" />);
    const section = screen.getByRole("region", { name: "איך אנחנו משווים מחירים" });
    expect(section).toHaveTextContent(`מע״מ ביבוא של ${ISRAEL_IMPORT_POLICY.vatRateBps / 100}%`);
  });
});
