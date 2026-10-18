import { render, screen, within } from "@testing-library/react";
import {
  AFFILIATE_DISCLOSURE,
  AMAZON_ASSOCIATES_DISCLOSURE,
  SiteFooter,
} from "@/components/layout/site-footer";

describe("SiteFooter", () => {
  it("shows the Amazon Associates disclosure with Amazon's exact wording", () => {
    render(<SiteFooter />);
    expect(AMAZON_ASSOCIATES_DISCLOSURE).toBe("As an Amazon Associate I earn from qualifying purchases.");
    expect(screen.getByRole("contentinfo")).toHaveTextContent(AMAZON_ASSOCIATES_DISCLOSURE);
  });

  it("declares both affiliate programs", () => {
    render(<SiteFooter />);
    expect(AFFILIATE_DISCLOSURE).toBe(
      "OneCart is a participant in affiliate programs including the eBay Partner Network, Amazon Associates and the AliExpress Affiliate Program. We may earn a commission on qualifying purchases at no additional cost to you.",
    );
    expect(screen.getByRole("contentinfo")).toHaveTextContent(AFFILIATE_DISCLOSURE);
  });

  it("links the privacy policy and terms", () => {
    render(<SiteFooter />);
    const legal = screen.getByRole("navigation", { name: "Legal" });
    expect(within(legal).getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    expect(within(legal).getByRole("link", { name: "Terms of Use" })).toHaveAttribute("href", "/terms");
  });

  it("in Hebrew: Hebrew disclosure, Amazon's sentence word for word, and the English legal pages", () => {
    render(<SiteFooter locale="he" categories={[{ slug: "headphones", label: "Headphones" }]} />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent("OneCart משתתפת בתוכניות שותפים");
    expect(screen.getByText(AMAZON_ASSOCIATES_DISCLOSURE)).toHaveAttribute("lang", "en");
    const legal = screen.getByRole("navigation", { name: "מידע משפטי" });
    const privacy = within(legal).getByRole("link", { name: "מדיניות פרטיות" });
    expect(privacy).toHaveAttribute("href", "/privacy");
    expect(privacy).toHaveAttribute("hreflang", "en");
    const categories = screen.getByRole("navigation", { name: "קטגוריות" });
    expect(within(categories).getByRole("link", { name: "Headphones" })).toHaveAttribute(
      "href",
      "/he/c/headphones",
    );
  });
});
