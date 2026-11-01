import { render, screen } from "@testing-library/react";
import { RedisHealthBanner } from "@/components/features/internal/redis-health-banner";

describe("RedisHealthBanner", () => {
  it("warns about every Redis issue, linking to the status page", () => {
    render(
      <RedisHealthBanner
        issues={[
          {
            key: "quota-near:Upstash Redis commands this month",
            message: "Upstash Redis commands this month: 82% used (412,345 of 500,000)",
          },
        ]}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Redis needs attention");
    expect(alert).toHaveTextContent("82% used (412,345 of 500,000)");
    expect(screen.getByRole("link", { name: "Open the status page" })).toHaveAttribute(
      "href",
      "/internal/status",
    );
  });

  it("renders nothing when Redis is healthy", () => {
    const { container } = render(<RedisHealthBanner issues={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
