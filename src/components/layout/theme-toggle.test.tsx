import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { THEME_STORAGE_KEY } from "@/components/layout/theme";
import { ThemeToggle } from "@/components/layout/theme-toggle";

let systemListener: (() => void) | null = null;
const media = {
  matches: false,
  addEventListener: jest.fn((_e: string, cb: () => void) => (systemListener = cb)),
  removeEventListener: jest.fn(),
};

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  media.matches = false;
  window.matchMedia = jest.fn().mockReturnValue(media);
});

describe("ThemeToggle", () => {
  it("switches light ↔ dark and remembers the choice", async () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: "Toggle dark mode" });

    await userEvent.click(button);
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    await userEvent.click(button);
    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("follows OS theme changes until the user picks a theme", async () => {
    render(<ThemeToggle />);
    media.matches = true;
    act(() => systemListener?.());
    expect(document.documentElement).toHaveClass("dark");

    await userEvent.click(screen.getByRole("button", { name: "Toggle dark mode" })); // user picks light
    media.matches = true;
    act(() => systemListener?.());
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("stops listening when unmounted", () => {
    const { unmount } = render(<ThemeToggle />);
    unmount();
    expect(media.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
