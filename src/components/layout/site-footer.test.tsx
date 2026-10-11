import { render, screen } from "@testing-library/react";
import { AMAZON_ASSOCIATES_DISCLOSURE, SiteFooter } from "@/components/layout/site-footer";

describe("SiteFooter", () => {
  it("shows the Amazon Associates disclosure with Amazon's exact wording", () => {
    render(<SiteFooter />);
    expect(AMAZON_ASSOCIATES_DISCLOSURE).toBe("As an Amazon Associate I earn from qualifying purchases.");
    expect(screen.getByRole("contentinfo")).toHaveTextContent(AMAZON_ASSOCIATES_DISCLOSURE);
  });
});
