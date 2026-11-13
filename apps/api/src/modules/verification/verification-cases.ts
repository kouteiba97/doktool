// Case records shared by the person's side and the reviewer's side.
import type { Prisma, ProfessionalType } from '../../generated/prisma/client.js';
import {
  type DeclaredDetails,
  maskOrderNumber,
  type StepRule,
  stepsFor,
  targetOf,
} from './verification.policy.js';

/** Columns of a case and its documents read by both sides. */
export const CASE_SELECT = {
  id: true,
  userId: true,
  type: true,
  status: true,
  submittedAt: true,
  decidedAt: true,
  expiresAt: true,
  appealedAt: true,
  reviewerId: true,
  rejectedById: true,
  rejectionReasonCode: true,
  rejectionNote: true,
  declaredDetails: true,
  createdAt: true,
  documents: {
    orderBy: { uploadedAt: 'asc' },
    select: {
      id: true,
      stepType: true,
      storageKey: true,
      mimeType: true,
      sizeBytes: true,
      uploadedAt: true,
      purgeAfter: true,
    },
  },
} satisfies Prisma.VerificationCaseSelect;

/** A case as read with CASE_SELECT. */
export type CaseRecord = Prisma.VerificationCaseGetPayload<{ select: typeof CASE_SELECT }>;

/** Newest case first. */
export const LATEST_FIRST = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.VerificationCaseOrderByWithRelationInput[];

/** The declared details as an object (empty when cleared). */
export function detailsOf(record: { declaredDetails: Prisma.JsonValue }): Record<string, unknown> {
  const value = record.declaredDetails;
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/** The role a case proves. */
export function caseTarget(record: CaseRecord): ProfessionalType | null {
  return targetOf(record.type, detailsOf(record));
}

/** A required or optional step, and whether its file is there. */
export interface StepState extends StepRule {
  provided: boolean;
}

/** The steps of a case with what is already provided. */
export function stepStates(record: CaseRecord): StepState[] {
  const provided = new Set(record.documents.map((document) => document.stepType));
  return stepsFor(record.type, caseTarget(record)).map((rule) => ({
    ...rule,
    provided: provided.has(rule.stepType),
  }));
}

/**
 * Details as the owner sees them: complete while the case is being prepared, then with the Ordre
 * number masked.
 */
export function ownerDetails(record: CaseRecord): Partial<DeclaredDetails> {
  const details = detailsOf(record) as Partial<DeclaredDetails>;
  if (record.status === 'NOT_STARTED' || !('orderNumber' in details)) return details;
  const orderNumber = details.orderNumber;
  return typeof orderNumber === 'string'
    ? { ...details, orderNumber: maskOrderNumber(orderNumber) }
    : details;
}
