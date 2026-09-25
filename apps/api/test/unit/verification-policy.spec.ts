import { describe, expect, it } from 'vitest';
import {
  addMonths,
  canTarget,
  checkDetails,
  maskOrderNumber,
  stepsFor,
  targetOf,
} from '../../src/modules/verification/verification.policy.js';

const ID = '0199a3c4-0000-7000-8000-000000000001';

describe('verification policy', () => {
  it('lists the steps of each case (section 06)', () => {
    expect(stepsFor('IDENTITY', null)).toEqual([
      { stepType: 'IDENTITY_FRONT', required: true },
      { stepType: 'IDENTITY_BACK', required: false },
    ]);
    expect(stepsFor('PROFESSIONAL_STATUS', 'DOCTOR')).toEqual([
      { stepType: 'ORDER_PROOF', required: true },
    ]);
    expect(stepsFor('PROFESSIONAL_STATUS', 'RESIDENT')).toEqual([
      { stepType: 'RESIDENCY_ATTESTATION', required: true },
    ]);
    expect(stepsFor('STUDENT_STATUS', 'STUDENT')).toEqual([
      { stepType: 'STUDENT_PROOF', required: true },
    ]);
  });

  it('never targets an earlier role', () => {
    expect(canTarget('STUDENT', 'RESIDENT')).toBe(true);
    expect(canTarget('STUDENT', 'DOCTOR')).toBe(true);
    expect(canTarget('RESIDENT', 'DOCTOR')).toBe(true);
    expect(canTarget('DOCTOR', 'DOCTOR')).toBe(true);
    expect(canTarget('DOCTOR', 'RESIDENT')).toBe(false);
    expect(canTarget('RESIDENT', 'STUDENT')).toBe(false);
  });

  it('derives the proved role from the case', () => {
    expect(targetOf('IDENTITY', { professionalType: 'DOCTOR' })).toBeNull();
    expect(targetOf('STUDENT_STATUS', {})).toBe('STUDENT');
    expect(targetOf('PROFESSIONAL_STATUS', { professionalType: 'RESIDENT' })).toBe('RESIDENT');
    expect(targetOf('PROFESSIONAL_STATUS', {})).toBe('DOCTOR');
  });

  it('accepts exactly the details of the case type', () => {
    expect(checkDetails('IDENTITY', null, { documentKind: 'PASSPORT' }).ok).toBe(true);
    expect(
      checkDetails('PROFESSIONAL_STATUS', 'DOCTOR', {
        professionalType: 'DOCTOR',
        orderNumber: '12/4567',
        specialtyId: ID,
      }).ok,
    ).toBe(true);
    expect(
      checkDetails('PROFESSIONAL_STATUS', 'RESIDENT', {
        professionalType: 'RESIDENT',
        residencyYear: 3,
        institutionId: ID,
        specialtyId: ID,
      }).ok,
    ).toBe(true);
    expect(
      checkDetails('STUDENT_STATUS', 'STUDENT', {
        professionalType: 'STUDENT',
        universityId: ID,
        academicYear: 7,
      }).ok,
    ).toBe(true);
  });

  it('names the fields that are missing, extra or out of range', () => {
    const missing = checkDetails('PROFESSIONAL_STATUS', 'DOCTOR', { professionalType: 'DOCTOR' });
    expect(missing.ok).toBe(false);
    if (!missing.ok)
      expect(Object.keys(missing.fields).sort()).toEqual(['orderNumber', 'specialtyId']);

    const extra = checkDetails('IDENTITY', null, { documentKind: 'PASSPORT', universityId: ID });
    expect(extra.ok).toBe(false);

    const year = checkDetails('STUDENT_STATUS', 'STUDENT', {
      professionalType: 'STUDENT',
      universityId: ID,
      academicYear: 8,
    });
    expect(year.ok).toBe(false);
    if (!year.ok) expect(Object.keys(year.fields)).toEqual(['academicYear']);

    expect(
      checkDetails('PROFESSIONAL_STATUS', 'DOCTOR', {
        professionalType: 'DOCTOR',
        orderNumber: '<script>',
        specialtyId: ID,
      }).ok,
    ).toBe(false);
  });

  it('keeps the last three characters of an Ordre number', () => {
    expect(maskOrderNumber('AB-123456')).toBe('••••••456');
    expect(maskOrderNumber('42')).toBe('42');
  });

  it('adds calendar months in UTC', () => {
    expect(addMonths(new Date('2026-09-25T10:00:00Z'), 24).toISOString()).toBe(
      '2028-09-25T10:00:00.000Z',
    );
    expect(addMonths(new Date('2026-09-25T10:00:00Z'), -24).toISOString()).toBe(
      '2024-09-25T10:00:00.000Z',
    );
  });
});
