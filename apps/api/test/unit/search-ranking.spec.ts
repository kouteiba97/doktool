import { describe, expect, it } from 'vitest';
import {
  editDistance,
  intentOf,
  normalize,
  score,
  SCORE,
  type SearchEntry,
  suggestions,
  withoutIntent,
} from '../../src/modules/search/ranking.js';

const entry = (
  titles: string[],
  synonyms: string[] = [],
  purposes: string[] = [],
): SearchEntry => ({
  type: 'ORDONNANCE',
  titles,
  synonyms,
  purposes,
});

describe('search ranking (section 12)', () => {
  it('normalises case, accents, apostrophes and hyphens', () => {
    expect(normalize("  L'Arrêt-de-Travail  ")).toBe('l arret de travail');
    expect(normalize('Paracétamol')).toBe('paracetamol');
  });

  it('computes transposition-aware edit distances with an early stop', () => {
    expect(editDistance('certificat', 'certificat', 2)).toBe(0);
    expect(editDistance('cetrificat', 'certificat', 2)).toBe(1);
    expect(editDistance('abc', 'xyzuvw', 2)).toBe(3);
  });

  it('orders exact, prefix, synonym, word-prefix, contains, fuzzy and purpose matches', () => {
    const model = entry(['Certificat médical initial', 'Initial medical certificate'], ['CMI']);
    expect(score('certificat medical initial', model)).toBe(SCORE.exact);
    expect(score('Certif', model)).toBe(SCORE.prefix);
    expect(score('cmi', model)).toBe(SCORE.synonymExact);
    expect(score('med init', model)).toBe(SCORE.wordPrefix);
    expect(score('dical', model)).toBe(SCORE.contains);
    expect(score('certificta', model)).toBe(SCORE.fuzzy - 10);
    const calculator = entry(
      ['Cockcroft-Gault'],
      ['clairance'],
      ['Estime la clairance de la créatinine'],
    );
    expect(score('creatinine', calculator)).toBe(SCORE.purpose);
    expect(score('clairance', calculator)).toBe(SCORE.synonymExact);
  });

  it('matches either language, whatever the interface language', () => {
    const model = entry(['Arrêt de travail', 'Sick leave']);
    expect(score('sick', model)).toBe(SCORE.prefix);
    expect(score('leave', model)).toBe(SCORE.wordPrefix);
    expect(score('arret', model)).toBe(SCORE.prefix);
  });

  it('allows no typo on words of two letters and at most two on long words', () => {
    const model = entry(['Angine streptococcique']);
    expect(score('xx', model)).toBeNull();
    expect(score('streptocoqique', model)).not.toBeNull();
    expect(score('strpetocoqiqe', model)).toBeNull();
  });

  it('detects the category a query names', () => {
    expect(intentOf('arrêt de travail')).toBe('CERTIFICATE');
    expect(intentOf('score de Glasgow')).toBe('CALCULATOR');
    expect(intentOf('ordonnance angine')).toBe('ORDONNANCE');
    expect(intentOf('angine')).toBeNull();
    expect(withoutIntent('certificat grossesse')).toBe('grossesse');
    expect(withoutIntent('certificats')).toBe('certificats');
    expect(intentOf('ibuprofène grossesse')).toBe('PREGNANCY');
    expect(intentOf('allaitement amoxicilline')).toBe('PREGNANCY');
    expect(withoutIntent('ibuprofène grossesse')).toBe('ibuprofene');
  });

  it('suggests close titles when nothing matched', () => {
    const entries = [
      { title: 'Certificat de grossesse', entry: entry(['Certificat de grossesse']) },
      { title: 'Angine', entry: entry(['Angine']) },
    ];
    expect(suggestions('grosesses', entries)).toEqual(['Certificat de grossesse']);
    expect(suggestions('zz', entries)).toEqual([]);
  });
});

/** The original full-matrix optimal-string-alignment distance, kept as the reference. */
function referenceDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Number.POSITIVE_INFINITY;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        value = Math.min(value, d[i - 2]![j - 2]! + 1);
      d[i]![j] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length]![b.length]!;
}

describe('edit distance (rolling rows, ADR-025)', () => {
  it('matches the full-matrix reference on 20 000 random word pairs', () => {
    let seed = 42;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const letters = 'abceilnorstué';
    const word = () =>
      Array.from(
        { length: Math.floor(random() * 10) },
        () => letters[Math.floor(random() * letters.length)],
      ).join('');
    for (let n = 0; n < 20_000; n++) {
      const a = word();
      // Half the pairs are near misses (a swap or a change), the others unrelated.
      let b = word();
      if (random() < 0.5 && a.length > 1) {
        const i = Math.floor(random() * (a.length - 1));
        b = a.slice(0, i) + a[i + 1] + a[i] + a.slice(i + 2);
        if (random() < 0.5) b = b.slice(0, -1) + 'x';
      }
      const max = Math.floor(random() * 3);
      expect(editDistance(a, b, max), `${a} / ${b} / ${max}`).toBe(referenceDistance(a, b, max));
    }
  });
});
