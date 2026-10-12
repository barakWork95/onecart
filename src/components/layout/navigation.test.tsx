import { render, screen, within } from "@testing-library/react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { DesktopNav } from "@/components/layout/desktop-nav";

let pathname = "/saved";
jest.mock("next/navigation", () => ({ usePathname: () => pathname }));

describe.each([
  ["BottomNav (mobile)", BottomNav, "md:hidden"],
  ["DesktopNav (header)", DesktopNav, "md:block"],
] as const)("%s", (_label, Nav, breakpointClass) => {
  it("links every section and marks the current one", () => {
    pathname = "/saved";
    render(<Nav />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((l) => l.getAttribute("href")),
    ).toEqual(["/", "/search", "/saved", "/alerts"]);
    expect(within(nav).getByRole("link", { name: "Saved" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Discover" })).not.toHaveAttribute("aria-current");
  });

  it("only shows at its own breakpoint", () => {
    render(<Nav />);
    expect(screen.getByRole("navigation", { name: "Main" })).toHaveClass(breakpointClass);
  });
});
