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
