import { en, type Dictionary } from "@/i18n/dictionaries/en";
import { he } from "@/i18n/dictionaries/he";
import type { Locale } from "@/i18n/locales";

export type { Dictionary };

export const DICTIONARIES: Readonly<Record<Locale, Dictionary>> = { en, he };
