// Title matching and ordering shared by every library (reference models, calculators, search).

/** Accent- and case-insensitive form of a text ("Céphalée" ~ "cephalee"). */
export function normaliseForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when every word of `query` appears in one of `texts`, in any order. */
export function matchesAllWords(query: string, texts: (string | null | undefined)[]): boolean {
  const words = normaliseForSearch(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  return texts.some((text) => {
    const haystack = normaliseForSearch(text ?? '');
    return words.every((word) => haystack.includes(word));
  });
}

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

/** French A–Z order. */
export function compareFrench(a: string, b: string): number {
  return collator.compare(a, b);
}
