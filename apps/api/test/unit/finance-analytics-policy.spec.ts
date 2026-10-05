// Phase 17: the finance arithmetic (gross → fees → net; net → expenses → profit) and the analytics
// privacy rules (no free text, suppression under 10 people).
import { describe, expect, it } from 'vitest';
import { checkEvent, suppress } from '../../src/modules/analytics/analytics.policy.js';
import {
  bucketFor,
  bucketStart,
  bucketStarts,
  csvDocument,
  decimal,
  estimateFee,
  feeOf,
  ledgerOf,
  previousPeriod,
} from '../../src/modules/finance/finance.policy.js';

const rates = new Map([['SATIM_CIB' as const, { rateBps: 150, fixedMinor: 1_000 }]]);

describe('finance ledger', () => {
  it('keeps gross, fees, net revenue and net profit apart', () => {
    const ledger = ledgerOf({
      revenue: [
        { amountMinor: 150_000, paymentFeesMinor: 2_000, paymentProvider: 'SATIM_CIB' },
        { amountMinor: 150_000, paymentFeesMinor: null, paymentProvider: 'SATIM_CIB' },
      ],
      rates,
      adjustments: [{ amountMinor: -150_000 }],
      expenses: [{ amountMinor: 50_000 }],
    });
    // estimated fee of the unsettled payment: 1.5 % of 150 000 + 1 000 = 3 250
    expect(ledger).toEqual({
      grossMinor: 150_000,
      adjustmentsMinor: -150_000,
      feesMinor: 5_250,
      estimatedFeesMinor: 3_250,
      netRevenueMinor: 144_750,
      expensesMinor: 50_000,
      netProfitMinor: 94_750,
      payments: 2,
    });
  });

  it('estimates fees from the provider rate, never above the amount, and flags a missing rate', () => {
    expect(estimateFee(10_000, { rateBps: 150, fixedMinor: 1_000 })).toBe(1_150);
    expect(estimateFee(500, { rateBps: 0, fixedMinor: 1_000 })).toBe(500);
    expect(
      feeOf(
        { amountMinor: 10_000, paymentFeesMinor: null, paymentProvider: 'SATIM_EDAHABIA' },
        rates,
      ),
    ).toEqual({
      feesMinor: 0,
      estimated: true,
      rateMissing: true,
    });
    expect(
      feeOf(
        { amountMinor: 10_000, paymentFeesMinor: 90, paymentProvider: 'SATIM_EDAHABIA' },
        rates,
      ),
    ).toEqual({
      feesMinor: 90,
      estimated: false,
      rateMissing: false,
    });
  });

  it('compares with the previous equal period and buckets by day, week or month', () => {
    const period = { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-10-01T00:00:00Z') };
    expect(previousPeriod(period)).toEqual({
      from: new Date('2026-08-02T00:00:00Z'),
      to: new Date('2026-09-01T00:00:00Z'),
    });
    expect(bucketFor(period)).toBe('DAY');
    expect(bucketFor({ from: period.from, to: new Date('2026-12-01T00:00:00Z') })).toBe('WEEK');
    expect(bucketFor({ from: period.from, to: new Date('2027-09-01T00:00:00Z') })).toBe('MONTH');
    // 2026-09-02 is a Wednesday: its ISO week starts on Monday 2026-08-31
    expect(bucketStart(new Date('2026-09-02T15:00:00Z'), 'WEEK')).toEqual(
      new Date('2026-08-31T00:00:00Z'),
    );
    expect(bucketStarts(period, 'DAY')).toHaveLength(30);
  });

  it('writes spreadsheet-safe CSV with definitions first', () => {
    const csv = csvDocument(
      ['Gross; with separator'],
      ['Plan', 'Amount'],
      [['PRO "M"', decimal(150_050)]],
    );
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"# Gross; with separator"');
    expect(csv).toContain('"PRO ""M""";1500.50');
    expect(decimal(-5)).toBe('-0.05');
  });
});

describe('analytics events', () => {
  const now = new Date('2026-09-26T12:00:00Z');
  const entityId = '01920000-0000-7000-8000-000000000001';

  it('accepts counts and codes and fills the columns', () => {
    const checked = checkEvent(
      {
        type: 'CALCULATOR_COMPLETED',
        occurredAt: new Date('2026-09-26T11:00:00Z'),
        entityId,
        properties: { version: 3, resultBand: 'STAGE_3A', engine: 'dart-1.0.0' },
      },
      false,
      now,
    );
    expect(checked).toEqual({
      ok: true,
      columns: {
        entityType: 'CALCULATOR',
        entityId,
        calculatorVersion: 3,
        resultBand: 'STAGE_3A',
        properties: { version: 3, resultBand: 'STAGE_3A', engine: 'dart-1.0.0' },
      },
    });
  });

  it('counts favorite pregnancy · lactation profiles as substances (ADR-019)', () => {
    const checked = checkEvent(
      {
        type: 'FAVORITE_ADDED',
        occurredAt: new Date('2026-09-26T11:00:00Z'),
        entityId: '0199a8c4-5a3e-7c1b-9d2f-3e4a5b6c7d8e',
        properties: { targetType: 'SUBSTANCE' },
      },
      false,
      now,
    );
    expect(checked).toMatchObject({ ok: true, columns: { entityType: 'SUBSTANCE' } });
  });

  it('refuses free text, missing entities, stale times and demo-only events outside the demo', () => {
    const base = { occurredAt: new Date('2026-09-26T11:00:00Z') };
    expect(
      checkEvent(
        {
          ...base,
          type: 'SEARCH_PERFORMED',
          properties: { resultCount: 2, groups: [], query: 'angine' },
        },
        false,
        now,
      ),
    ).toEqual({ ok: false, reason: 'PROPERTIES' });
    expect(
      checkEvent(
        { ...base, type: 'REFERENCE_OPENED', properties: { referenceType: 'ORDONNANCE' } },
        false,
        now,
      ),
    ).toEqual({
      ok: false,
      reason: 'ENTITY',
    });
    expect(
      checkEvent(
        {
          type: 'SUBSCRIPTION_VIEWED',
          occurredAt: new Date('2026-07-01T00:00:00Z'),
          properties: { screen: 'plans' },
        },
        false,
        now,
      ),
    ).toEqual({ ok: false, reason: 'TIME' });
    expect(
      checkEvent(
        { ...base, type: 'DEMO_STARTED', properties: { demoContext: 'DOCTOR' } },
        false,
        now,
      ),
    ).toEqual({ ok: false, reason: 'CONTEXT' });
  });

  it('suppresses any cell behind fewer than 10 people', () => {
    expect(suppress(42, 9)).toBeNull();
    expect(suppress(42, 10)).toBe(42);
  });
});
