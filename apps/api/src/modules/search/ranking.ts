// V1 search ranking (section 12): exact → prefix → synonym → fuzzy, bilingual, accent-insensitive.
// Pure functions, so the ranking contract is unit-tested apart from the database.

export type SearchType = 'ORDONNANCE' | 'CERTIFICATE' | 'CALCULATOR' | 'PREGNANCY';

export const SEARCH_TYPES: readonly SearchType[] = [
  'ORDONNANCE',
  'CERTIFICATE',
  'CALCULATOR',
  'PREGNANCY',
];

export interface SearchEntry {
  type: SearchType;
  /** Display titles in both languages (either may match, whatever the UI language). */
  titles: string[];
  synonyms: string[];
  /** Calculator one-line purpose; matched last. */
  purposes: string[];
}

/** Scores, highest first. Never boosted by commerce (Lock L12). */
export const SCORE = {
  exact: 1000,
  prefix: 800,
  synonymExact: 700,
  wordPrefix: 600,
  contains: 500,
  synonymPartial: 450,
  fuzzy: 300,
  purpose: 200,
} as const;

/** Lower case, no accents, apostrophes and hyphens as spaces, single spaces. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function words(text: string): string[] {
  const normalized = normalize(text);
  return normalized ? normalized.split(' ') : [];
}

/** Typos tolerated in a query word: none up to 2 letters, 1 up to 5, 2 above (section 12). */
export function allowedTypos(word: string): number {
  if (word.length <= 2) return 0;
  return word.length <= 5 ? 1 : 2;
}

/**
 * Optimal-string-alignment (Damerau-Levenshtein) distance, stopping early once it exceeds `max`
 * (returns max + 1 then).
 */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i < rows; i++) {
    let rowMin = Number.POSITIVE_INFINITY;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length]![b.length]!;
}

/** Distance of a query word to the closest word of `candidates` (also against their prefixes). */
function closest(queryWord: string, candidates: string[]): number {
  const max = allowedTypos(queryWord);
  let best = max + 1;
  for (const candidate of candidates) {
    if (candidate.startsWith(queryWord)) return 0;
    best = Math.min(best, editDistance(queryWord, candidate, max));
    if (candidate.length > queryWord.length) {
      best = Math.min(best, editDistance(queryWord, candidate.slice(0, queryWord.length), max));
    }
    if (best === 0) return 0;
  }
  return best;
}

/** The entry's score for `query`, or null when it does not match. */
export function score(query: string, entry: SearchEntry): number | null {
  const q = normalize(query);
  const qWords = q ? q.split(' ') : [];
  if (qWords.length === 0) return null;

  const titles = entry.titles.map(normalize).filter(Boolean);
  const synonyms = entry.synonyms.map(normalize).filter(Boolean);
  const titleWords = titles.flatMap((title) => title.split(' '));
  const synonymWords = synonyms.flatMap((synonym) => synonym.split(' '));

  if (titles.includes(q)) return SCORE.exact;
  if (titles.some((title) => title.startsWith(q))) return SCORE.prefix;
  if (synonyms.includes(q)) return SCORE.synonymExact;
  const everyWord = (pool: string[], test: (word: string, candidate: string) => boolean) =>
    qWords.every((word) => pool.some((candidate) => test(word, candidate)));
  if (titles.some((title) => everyWord(title.split(' '), (w, c) => c.startsWith(w)))) {
    return SCORE.wordPrefix;
  }
  if (titles.some((title) => qWords.every((word) => title.includes(word)))) return SCORE.contains;
  if (synonyms.some((synonym) => qWords.every((word) => synonym.includes(word)))) {
    return SCORE.synonymPartial;
  }

  const pool = [...titleWords, ...synonymWords];
  let distance = 0;
  for (const word of qWords) {
    const d = closest(word, pool);
    if (d > allowedTypos(word)) {
      distance = -1;
      break;
    }
    distance += d;
  }
  if (distance >= 0) return SCORE.fuzzy - 10 * distance;

  const purposes = entry.purposes.map(normalize).filter(Boolean);
  if (purposes.some((purpose) => qWords.every((word) => purpose.includes(word)))) {
    return SCORE.purpose;
  }
  return null;
}

const INTENT: Record<SearchType, string[]> = {
  ORDONNANCE: ['ordonnance', 'ordonnances', 'ordo', 'prescription', 'prescriptions'],
  CERTIFICATE: ['certificat', 'certificats', 'certificate', 'certificates', 'attestation', 'arret'],
  CALCULATOR: ['calcul', 'calculateur', 'calculateurs', 'calculator', 'calculators', 'score'],
  PREGNANCY: [
    'grossesse',
    'enceinte',
    'allaitement',
    'allaiter',
    'lactation',
    'pregnancy',
    'pregnant',
    'breastfeeding',
  ],
};

/** A query naming a category puts that group first (section 12 « intent boosts »). */
export function intentOf(query: string): SearchType | null {
  const qWords = words(query);
  for (const type of SEARCH_TYPES) {
    if (qWords.some((word) => INTENT[type].includes(word))) return type;
  }
  return null;
}

/**
 * The query without the words naming the detected category, so « certificat grossesse » matches
 * the model « Grossesse … » in the certificates group and « ibuprofène grossesse » matches the
 * substance. A query made only of such words stays whole.
 */
export function withoutIntent(query: string, intent: SearchType | null = intentOf(query)): string {
  if (!intent) return normalize(query);
  const kept = words(query).filter((word) => !INTENT[intent].includes(word));
  return kept.length > 0 ? kept.join(' ') : normalize(query);
}

/**
 * « Vouliez-vous dire » when nothing matched: up to three titles whose words are closest to the
 * query's longest word (distance ≤ 3).
 */
export function suggestions(
  query: string,
  entries: { title: string; entry: SearchEntry }[],
): string[] {
  const longest = words(query).sort((a, b) => b.length - a.length)[0];
  if (!longest || longest.length < 3) return [];
  return entries
    .map(({ title, entry }) => ({
      title,
      distance: Math.min(
        ...[...entry.titles, ...entry.synonyms]
          .flatMap(words)
          .map((word) => editDistance(longest, word, 3)),
        4,
      ),
    }))
    .filter((candidate) => candidate.distance <= 3)
    .sort((a, b) => a.distance - b.distance || a.title.localeCompare(b.title, 'fr'))
    .slice(0, 3)
    .map((candidate) => candidate.title);
}
