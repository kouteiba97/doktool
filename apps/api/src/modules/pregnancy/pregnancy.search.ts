// The searchable form of a substance (ADR-025): names and synonyms, accent- and case-folded the way
// queries are, stored in `substances.search_text` (trigram index) on every change.
import { normaliseForSearch } from '../../common/text/search-text.js';

/** The normalised text searched by the app: names and synonyms, accents removed, lower case. */
export function searchTextOf(
  nameFr: string,
  nameEn: string | null,
  synonyms: readonly string[],
): string {
  return normaliseForSearch([nameFr, nameEn ?? '', ...synonyms].join(' '));
}

/** Words of a query, each safe inside a LIKE pattern. */
export function likeWords(query: string): string[] {
  return normaliseForSearch(query)
    .split(' ')
    .filter(Boolean)
    .slice(0, 6)
    .map((word) => word.replace(/[\\%_]/g, (char) => `\\${char}`));
}
