// Self-contained (no imports) so it runs under `node --experimental-strip-types`.
export type ImageKind = "drug" | "pharmacy";

/** Resolve an API image path against `base`; null/empty/unknown falls back to the default image. */
export function buildImageUrl(base: string, path: string | null | undefined, kind: ImageKind): string {
  const root = base.replace(/\/+$/, "");
  if (path && path.startsWith("/static/")) return root === "/demo-api" ? path : root + path;
  if (path && /^https?:\/\//i.test(path)) return path;
  return root === "/demo-api" ? `/static/images/default-${kind}.webp` : `${root}/static/images/default-${kind}.webp`;
}
