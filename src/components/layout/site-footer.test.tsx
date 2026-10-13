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
      "OneCart is a participant in affiliate programs including the eBay Partner Network and Amazon Associates. We may earn a commission on qualifying purchases at no additional cost to you.",
    );
    expect(screen.getByRole("contentinfo")).toHaveTextContent(AFFILIATE_DISCLOSURE);
  });

  it("links the privacy policy and terms", () => {
    render(<SiteFooter />);
    const legal = screen.getByRole("navigation", { name: "Legal" });
    expect(within(legal).getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    expect(within(legal).getByRole("link", { name: "Terms of Use" })).toHaveAttribute("href", "/terms");
  });
});
