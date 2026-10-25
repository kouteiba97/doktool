import { describe, expect, it } from 'vitest';
import { describeProblem } from '@/features/pregnancy/problems';
import { createTranslator } from '@/i18n/messages';

const fr = createTranslator('fr');

describe('review checklist in words (ADR-025)', () => {
  it.each([
    ['sources: at least one source is required', 'Sources : au moins une source'],
    ['pregnancy: the pregnancy block is required', 'Grossesse : bloc à remplir'],
    [
      'pregnancy.periods.T1.evidence.level: required',
      '1er trimestre · Niveau de preuve : à renseigner',
    ],
    ['pregnancy.periods.T2: required', '2e trimestre : à renseigner'],
    [
      'pregnancy.periods.T1.conductDetail: explain the conduct in one sentence',
      '1er trimestre · Consigne détaillée : expliquer la consigne en une phrase',
    ],
    ['lactation.conductText: required', 'Allaitement · Consigne : à renseigner'],
    [
      'pregnancy.periods.T3.unresolvedAlternatives: link « Inconnu X » to a substance or remove it',
      '3e trimestre · Alternatives : relier « Inconnu X » à une substance ou le retirer',
    ],
  ])('« %s »', (problem, expected) => {
    expect(describeProblem(problem, fr)).toBe(expected);
  });

  it('shows an unknown message as the server wrote it', () => {
    expect(describeProblem('pregnancy.periods.T1.newField: something new', fr)).toBe(
      '1er trimestre · newField : something new',
    );
    expect(describeProblem('no separator', fr)).toBe('no separator');
  });
});
