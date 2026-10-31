"use client";

import { useState } from "react";
import { imageUrl } from "@/lib/api";

/** Fixed-size product/pharmacy image. Falls back to the default image once on load error. */
export default function Thumb({
  src,
  kind,
  alt,
  size = 64,
  className = "",
}: {
  src: string | null | undefined;
  kind: "drug" | "pharmacy";
  alt: string;
  size?: number;
  className?: string;
}) {
  const url = imageUrl(src, kind);
  const def = imageUrl(null, kind);
  const [failed, setFailed] = useState<string | null>(null);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={failed === url ? def : url}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => url !== def && setFailed(url)}
      style={{ width: `${size / 16}rem`, height: `${size / 16}rem` }}
      className={`shrink-0 rounded-xl bg-page object-contain ${className}`}
    />
  );
}
