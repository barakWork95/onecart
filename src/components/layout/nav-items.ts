import { splitLocale } from "@/i18n/locales";
import { ArrowRightLeft, Bookmark, Compass, TrendingDown, type LucideIcon } from "lucide-react";

/** The app's four sections — shown as the mobile tab bar and the desktop header nav. */
export interface NavItem {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly href: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Discover", icon: Compass, href: "/" },
  { label: "Compare", icon: ArrowRightLeft, href: "/search" },
  { label: "Saved", icon: Bookmark, href: "/saved" },
  { label: "Alerts", icon: TrendingDown, href: "/alerts" },
];

/** "/" matches only the home page; other sections match their sub-paths too. */
export function isActive(href: string, pathname: string): boolean {
  // Compare English paths: "/he/saved" and the rewritten "/en/saved" are both "/saved".
  const path = splitLocale(pathname).path;
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}
