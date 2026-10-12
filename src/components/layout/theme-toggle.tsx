"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect } from "react";
import { applyTheme, storedTheme, storeTheme } from "@/components/layout/theme";

/**
 * Sun/moon switch between light and dark, remembered in localStorage. Icons
 * swap with CSS (`dark:`), not React state, so server and client render the
 * same markup — no hydration mismatch, correct icon from the first paint.
 */
export function ThemeToggle() {
  // Until the user picks a theme, keep following the OS setting live.
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const follow = () => {
      if (!storedTheme()) applyTheme(media.matches ? "dark" : "light");
    };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);

  function toggle() {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    applyTheme(next);
    storeTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Sun className="size-4 dark:hidden" aria-hidden />
      <Moon className="hidden size-4 dark:block" aria-hidden />
    </button>
  );
}
