"use client";

import { Package } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A store's product photo on the white tile, or a neutral placeholder when
 * the store sent none or the photo fails to load (a broken image would leave
 * the tile blank). Served straight from the store's CDN, already sized:
 * routing every product photo through the image optimizer added a hop and
 * counted each new product against the host's optimization quota.
 */
export function ProductImage({
  src,
  sizes,
  className,
}: {
  src: string | null;
  sizes: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <Package className="absolute inset-0 m-auto size-1/3 text-muted-foreground/50" aria-hidden />;
  }
  return (
    <Image
      src={src}
      alt=""
      fill
      unoptimized
      sizes={sizes}
      onError={() => setFailed(true)}
      // Whole product visible, never cropped — like Amazon's own listings.
      className={cn("object-contain", className)}
    />
  );
}
