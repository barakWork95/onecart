/** A product we feature on the homepage, by the search that finds it. */
export interface TrendingQuery {
  /** Card heading, e.g. "Sony WH-1000XM5". */
  readonly label: string;
  /** The search behind the card (English), e.g. "sony wh-1000xm5". */
  readonly query: string;
}
