import { splitLocale } from "@/i18n/locales";
import { ArrowRightLeft, Bookmark, Compass, TrendingDown, type LucideIcon } from "lucide-react";

/** The app's four sections — shown as the mobile tab bar and the desktop header nav. */
export interface NavItem {
  /** The section's name in the dictionary (`nav.*`). */
  readonly key: "discover" | "compare" | "saved" | "alerts";
  readonly icon: LucideIcon;
  /** The English path; `localizedPath` gives the link in the page's language. */
  readonly href: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: "discover", icon: Compass, href: "/" },
  { key: "compare", icon: ArrowRightLeft, href: "/search" },
  { key: "saved", icon: Bookmark, href: "/saved" },
  { key: "alerts", icon: TrendingDown, href: "/alerts" },
];

/** "/" matches only the home page; other sections match their sub-paths too. */
export function isActive(href: string, pathname: string): boolean {
  // Compare English paths: "/he/saved" and the rewritten "/en/saved" are both "/saved".
  const path = splitLocale(pathname).path;
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}
