import { render, screen, within } from "@testing-library/react";
import type { StatusReport } from "@/application/ops/status-report";
import { StatusView } from "@/components/features/internal/status-view";

const ok = {
  job: "warm-trending" as const,
  startedAt: "2026-10-19T07:30:00.000Z",
  finishedAt: "2026-10-19T07:30:31.000Z",
  ok: true,
  problems: [],
};

const REPORT: StatusReport = {
  generatedAt: "2026-10-19T08:00:00.000Z",
  issues: [
    {
      key: "quota:SerpApi searches this month (Amazon)",
      message: "SerpApi searches this month (Amazon): none left",
    },
  ],
  jobs: [
    { job: "warm-trending", last: ok, lastOk: ok, stale: false },
    {
      job: "price-alerts",
      last: { ...ok, job: "price-alerts", ok: false, problems: ["price alerts: 2 searches failed"] },
      lastOk: { ...ok, job: "price-alerts", finishedAt: "2026-10-18T05:00:20.000Z" },
      stale: false,
    },
  ],
  quotas: [
    {
      name: "SerpApi searches this month (Amazon)",
      used: 250,
      limit: 250,
      remaining: 0,
      resetsAt: null,
      error: null,
    },
    {
      name: "eBay Browse API calls today",
      used: null,
      limit: null,
      remaining: null,
      resetsAt: null,
      error: "HTTP 500",
    },
  ],
  prices: {
    kind: "ok",
    value: [
      { day: "2026-10-19", count: 611 },
      { day: "2026-10-18", count: 0 },
    ],
  },
  push: { kind: "error", message: "permission denied" },
  clicksToday: { kind: "not_configured" },
};

describe("StatusView", () => {
  it("leads with the problems, then each section", () => {
    render(<StatusView report={REPORT} alertsPanel={<p>alerts switch</p>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 problem:SerpApi searches this month (Amazon): none left",
    );
    expect(screen.getByText("alerts switch")).toBeInTheDocument();

    const runs = screen.getByRole("region", { name: "Cron runs" });
    expect(runs).toHaveTextContent("warm-trending ok");
    expect(runs).toHaveTextContent("price-alerts problems");
    expect(runs).toHaveTextContent(": price alerts: 2 searches failed");
    expect(runs).toHaveTextContent("Last ok 18 Oct, 08:00");

    const quotas = screen.getByRole("region", { name: "Quotas" });
    expect(within(quotas).getByRole("row", { name: /SerpApi/ })).toHaveTextContent("250 / 2500");
    expect(quotas).toHaveTextContent("Couldn't read: HTTP 500");

    expect(screen.getByRole("list", { name: "Rows recorded per day" })).toHaveTextContent("2026-10-19611");
    expect(screen.getByRole("region", { name: "Price-alert notifications" })).toHaveTextContent(
      "Couldn't load: permission denied",
    );
    expect(screen.getByRole("region", { name: "Clicks today" })).toHaveTextContent("Not configured here.");
  });

  it("says all good when nothing's wrong, and shows loaded push and click figures", () => {
    render(
      <StatusView
        report={{
          ...REPORT,
          issues: [],
          quotas: [],
          push: {
            kind: "ok",
            value: {
              subscriptions: 3,
              failingSubscriptions: 0,
              alertsActive: 5,
              alertsTriggered: 1,
              alertsWaiting: 0,
            },
          },
          clicksToday: { kind: "ok", value: { clicks: 9, affiliated: 8 } },
        }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("All good.");
    expect(screen.getByText("No live stores configured here.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Price-alert notifications" })).toHaveTextContent(
      "Subscribed browsers3",
    );
    expect(screen.getByRole("region", { name: "Clicks today" })).toHaveTextContent(
      "9 clicks, 8 affiliate-tagged.",
    );
  });
});
