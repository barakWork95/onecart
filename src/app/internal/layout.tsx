import type { Metadata, Viewport } from "next";
import { BASE_METADATA, BASE_VIEWPORT, HtmlShell } from "@/app/_html";
import { AppHeader } from "@/components/layout/app-header";

export const metadata: Metadata = BASE_METADATA;
export const viewport: Viewport = BASE_VIEWPORT;

/** The admin pages' own root layout: English only, no shopper navigation. */
export default function InternalLayout({ children }: LayoutProps<"/internal">) {
  return (
    <HtmlShell lang="en" dir="ltr">
      <AppHeader />
      {children}
    </HtmlShell>
  );
}
