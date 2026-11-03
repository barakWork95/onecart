/** Direct search link only: no scraped price, image or claim of a matched Amazon offer. */
export function amazonCheckUrl(query: string, tag?: string): string {
  const params = new URLSearchParams({ k: query.trim().slice(0, 200) || "headphones" });
  if (tag?.trim()) params.set("tag", tag.trim());
  return `https://www.amazon.com/s?${params.toString()}`;
}
