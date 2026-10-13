import { render, screen, within } from "@testing-library/react";
import { ClickReportView } from "@/components/features/internal/click-report-view";
import { summarizeClicks } from "@/domain/affiliate/click-stats";

const report = {
  sinceDay: "2026-09-14",
  ...summarizeClicks([
    { day: "2026-10-12", provider: "ebay", clicks: 6, affiliated: 0 },
    { day: "2026-10-13", provider: "amazon", clicks: 4, affiliated: 4 },
  ]),
};

describe("ClickReportView", () => {
  it("shows totals, per-store and per-day tables", () => {
    render(<ClickReportView state={{ kind: "ready", report }} days={30} />);
    expect(screen.getByRole("heading", { level: 1, name: "Outbound clicks" })).toBeInTheDocument();
    expect(screen.getByText("since 2026-09-14", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();

    const [byStore, byDay] = screen.getAllByRole("table");
    const ebay = within(byStore!).getByRole("row", { name: /eBay/ });
    expect(
      within(ebay)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["6", "0", "0%"]);
    const rows = within(byDay!).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getByRole("rowheader").textContent)).toEqual([
      "2026-10-13",
      "2026-10-12",
    ]);
    expect(within(rows[0]!).getByText("Amazon 4")).toBeInTheDocument();
  });

  it("says when there are no clicks yet", () => {
    render(
      <ClickReportView
        state={{ kind: "ready", report: { sinceDay: "2026-09-14", ...summarizeClicks([]) } }}
        days={30}
      />,
    );
    expect(screen.getByText("No clicks in this period yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("explains a missing configuration or a load failure", () => {
    const { rerender } = render(<ClickReportView state={{ kind: "not_configured" }} days={30} />);
    expect(screen.getByText(/isn.t configured/)).toBeInTheDocument();
    rerender(<ClickReportView state={{ kind: "error" }} days={30} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load clicks");
  });
});
