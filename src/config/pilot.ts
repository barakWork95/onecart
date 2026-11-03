import { CATEGORIES, DEMO_CATEGORIES } from "@/config/categories";
import type { Category } from "@/domain/deals/category";
import type { TrendingQuery } from "@/domain/deals/trending-query";

/** Candidate catalog, not a claim that a store's offers or affiliate rights are verified. */
export const HEADPHONES_PILOT_PRODUCTS: readonly TrendingQuery[] = [
  { label: "Sony WH-1000XM5", query: "sony wh-1000xm5" },
  { label: "Sony WH-1000XM4", query: "sony wh-1000xm4" },
  { label: "Sony WH-CH720N", query: "sony wh-ch720n" },
  { label: "Sony WH-CH520", query: "sony wh-ch520" },
  { label: "Sony WF-1000XM5", query: "sony wf-1000xm5" },
  { label: "Soundcore Life P3", query: "soundcore life p3" },
  { label: "Soundcore Liberty 4 NC", query: "soundcore liberty 4 nc" },
  { label: "Soundcore Space Q45", query: "soundcore space q45" },
  { label: "JBL Tune 520BT", query: "jbl tune 520bt" },
  { label: "JBL Tune 720BT", query: "jbl tune 720bt" },
  { label: "JBL Tune 770NC", query: "jbl tune 770nc" },
  { label: "JBL Live 660NC", query: "jbl live 660nc" },
  { label: "Sennheiser Momentum 4", query: "sennheiser momentum 4" },
  { label: "Sennheiser Accentum Wireless", query: "sennheiser accentum wireless" },
  { label: "Bose QuietComfort 45", query: "bose quietcomfort 45" },
];

/** The flag narrows discovery and warming; live search validation is a separate launch gate. */
export function catalogCategories(config: {
  readonly ONECART_DEMO_PROVIDERS: boolean;
  readonly ONECART_HEADPHONES_PILOT: boolean;
}): readonly Category[] {
  if (config.ONECART_DEMO_PROVIDERS) return DEMO_CATEGORIES;
  if (!config.ONECART_HEADPHONES_PILOT) return CATEGORIES;
  return CATEGORIES.filter((category) => category.slug === "headphones").map((category) => ({
    ...category,
    products: HEADPHONES_PILOT_PRODUCTS,
    description: "Compare 15 headphone models with estimated delivery and import costs to Israel.",
    intro:
      "A small headphone comparison pilot. Check the model, colour, condition and bundle at the store. Totals include quoted shipping and estimated import taxes; other carrier and payment fees may apply.",
    he: {
      ...category.he,
      description: "השוואת 15 דגמי אוזניות עם עלויות משלוח ויבוא משוערות לישראל.",
      intro:
        "פיילוט מצומצם להשוואת אוזניות. בדקו בחנות את הדגם, הצבע, המצב ותכולת המארז. הסכומים כוללים משלוח שצוין ומסי יבוא משוערים; ייתכנו עמלות שילוח ותשלום נוספות.",
      products: {},
    },
  }));
}
