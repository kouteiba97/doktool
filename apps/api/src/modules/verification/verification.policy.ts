// What each verification case must contain, and how long its documents are kept (section 06).
import { z } from 'zod';
import type { ProfessionalType, VerificationType } from '../../generated/prisma/enums.js';

/** Service level of the review queue: a case waiting longer is flagged (Admin Web « SLA 24 h »). */
export const VERIFICATION_SLA_HOURS = 24;

/** Documents and declared details are deleted this long after the decision (section 06). */
export const DOCUMENT_RETENTION_MONTHS = 24;
/** Reminders before a verification expires (section 06). */
export const EXPIRY_REMINDER_DAYS = [60, 14] as const;
/** A new case may replace a verified one from this many days before it expires. */
export const RENEWAL_WINDOW_DAYS = 60;
/** Cases never submitted are deleted, with their files, after this many days without activity. */
export const ABANDONED_CASE_DAYS = 90;
/** An appeal is possible after this many rejections of the same type (section 06). */
export const REJECTIONS_BEFORE_APPEAL = 2;

/** Reasons a reviewer can choose when rejecting. */
export const REJECTION_REASONS = [
  'ILLEGIBLE',
  'DOCUMENT_EXPIRED',
  'NAME_MISMATCH',
  'WRONG_DOCUMENT',
  'INFORMATION_MISMATCH',
  'OTHER',
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

/** The documents a case can ask for. */
export const STEP_TYPES = [
  'IDENTITY_FRONT',
  'IDENTITY_BACK',
  'ORDER_PROOF',
  'RESIDENCY_ATTESTATION',
  'STUDENT_PROOF',
] as const;
export type StepType = (typeof STEP_TYPES)[number];

/** Documents accepted to prove identity. */
export const IDENTITY_DOCUMENT_KINDS = ['NATIONAL_ID', 'PASSPORT', 'STUDENT_CARD'] as const;
export type IdentityDocumentKind = (typeof IDENTITY_DOCUMENT_KINDS)[number];

/** One step of a case and whether it is required. */
export interface StepRule {
  stepType: StepType;
  required: boolean;
}

/** DOCTOR ranks above RESIDENT above STUDENT; a status case never moves a person down. */
const RANK: Record<ProfessionalType, number> = { STUDENT: 0, RESIDENT: 1, DOCTOR: 2 };

/** True when moving from `current` to `target` is not a step down. */
export function canTarget(current: ProfessionalType, target: ProfessionalType): boolean {
  return RANK[target] >= RANK[current];
}

/** The professional type a status case proves; identity cases prove none. */
export function targetOf(
  type: VerificationType,
  details: Record<string, unknown>,
): ProfessionalType | null {
  if (type === 'IDENTITY') return null;
  if (type === 'STUDENT_STATUS') return 'STUDENT';
  return details.professionalType === 'RESIDENT' ? 'RESIDENT' : 'DOCTOR';
}

/**
 * The steps a case needs: identity front (+ optional back), student proof, residency attestation
 * or Ordre proof.
 */
export function stepsFor(type: VerificationType, target: ProfessionalType | null): StepRule[] {
  switch (type) {
    case 'IDENTITY':
      return [
        { stepType: 'IDENTITY_FRONT', required: true },
        { stepType: 'IDENTITY_BACK', required: false },
      ];
    case 'STUDENT_STATUS':
      return [{ stepType: 'STUDENT_PROOF', required: true }];
    case 'PROFESSIONAL_STATUS':
      return target === 'RESIDENT'
        ? [{ stepType: 'RESIDENCY_ATTESTATION', required: true }]
        : [{ stepType: 'ORDER_PROOF', required: true }];
  }
}

const uuid = z.uuid();
/** Ordre number: letters, digits, "/" and "-". */
const ORDER_NUMBER = /^[A-Za-z0-9][A-Za-z0-9/-]{0,29}$/;

const identitySchema = z.strictObject({ documentKind: z.enum(IDENTITY_DOCUMENT_KINDS) });
const doctorSchema = z.strictObject({
  professionalType: z.literal('DOCTOR'),
  orderNumber: z.string().regex(ORDER_NUMBER),
  specialtyId: uuid,
});
const residentSchema = z.strictObject({
  professionalType: z.literal('RESIDENT'),
  residencyYear: z.int().min(1).max(10),
  institutionId: uuid,
  specialtyId: uuid,
});
const studentSchema = z.strictObject({
  professionalType: z.literal('STUDENT'),
  universityId: uuid,
  academicYear: z.int().min(1).max(7),
});

/** Valid declared details of any case. */
export type DeclaredDetails =
  | z.infer<typeof identitySchema>
  | z.infer<typeof doctorSchema>
  | z.infer<typeof residentSchema>
  | z.infer<typeof studentSchema>;

/** The schema of the details for a case and role. */
function schemaFor(type: VerificationType, target: ProfessionalType | null) {
  if (type === 'IDENTITY') return identitySchema;
  if (type === 'STUDENT_STATUS') return studentSchema;
  return target === 'RESIDENT' ? residentSchema : doctorSchema;
}

/** Result of checkDetails: the parsed details, or the field errors. */
export type DetailsCheck =
  { ok: true; details: DeclaredDetails } | { ok: false; fields: Record<string, string[]> };

/** Validates complete declared details for a case (on save and again on submission). */
export function checkDetails(
  type: VerificationType,
  target: ProfessionalType | null,
  raw: Record<string, unknown>,
): DetailsCheck {
  const result = schemaFor(type, target).safeParse(raw);
  if (result.success) return { ok: true, details: result.data };
  const fields: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const field = issue.path.length > 0 ? issue.path.join('.') : 'details';
    (fields[field] ??= []).push(issue.message);
  }
  return { ok: false, fields };
}

/** The Ordre number reduced to its last three characters (what the owner sees after submission). */
export function maskOrderNumber(orderNumber: string): string {
  return `${'•'.repeat(Math.max(0, orderNumber.length - 3))}${orderNumber.slice(-3)}`;
}

/** Adds months in UTC (negative values go back). */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/** File types accepted for verification documents. */
export const EXTENSIONS: Record<string, 'jpg' | 'png' | 'pdf'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};
