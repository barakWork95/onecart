import { render, screen } from "@testing-library/react";
import { ContactLine, LEGAL_LAST_UPDATED, LegalPage } from "@/components/features/legal/legal-page";

describe("LegalPage", () => {
  it("has one h1, the update date and the intro", () => {
    render(
      <LegalPage title="Privacy Policy" intro="What we collect.">
        <section>
          <h2>Children</h2>
        </section>
      </LegalPage>,
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText(`Last updated ${LEGAL_LAST_UPDATED}`)).toBeInTheDocument();
    expect(screen.getByText("What we collect.")).toBeInTheDocument();
  });
});

describe("ContactLine", () => {
  it("links the configured contact address", () => {
    render(<ContactLine email="privacy@example.com" purpose="privacy questions" />);
    expect(screen.getByRole("link", { name: "privacy@example.com" })).toHaveAttribute(
      "href",
      "mailto:privacy@example.com",
    );
  });

  it("renders nothing without one, rather than a placeholder address", () => {
    const { container } = render(<ContactLine email={undefined} purpose="privacy questions" />);
    expect(container).toBeEmptyDOMElement();
  });
});
