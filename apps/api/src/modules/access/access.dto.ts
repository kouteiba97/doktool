import { ApiProperty } from '@nestjs/swagger';
import { EntitlementTier } from '../../generated/prisma/enums.js';
import {
  type AccessProfile,
  type ContentRule,
  FEATURE_KEYS,
  type FeatureDecision,
  type ItemAccess,
  LOCK_REASONS,
  UNLOCK_PATHS,
} from './access.types.js';

/**
 * One feature as the app receives it: available or locked, with the reason and where to go to
 * unlock it.
 */
export class FeatureDecisionDto {
  @ApiProperty({ enum: FEATURE_KEYS, enumName: 'FeatureKey' })
  key!: FeatureDecision['key'];

  @ApiProperty({ enum: ['AVAILABLE', 'LOCKED'], enumName: 'AccessState' })
  state!: FeatureDecision['state'];

  @ApiProperty({ enum: LOCK_REASONS, enumName: 'LockReason', nullable: true })
  lockReason!: FeatureDecision['lockReason'];

  @ApiProperty({ enum: UNLOCK_PATHS, enumName: 'UnlockPath', nullable: true })
  unlockPath!: FeatureDecision['unlockPath'];

  @ApiProperty({ description: 'Available for reading only.' })
  readOnly!: boolean;
}

/** Which items of a content type open for this person, and the lock shown on the others. */
export class ContentRuleDto {
  @ApiProperty({ enum: ['ALL', 'STUDENT_TIER', 'DEMO_SAMPLE', 'NONE'], enumName: 'ContentScope' })
  scope!: ContentRule['scope'];

  @ApiProperty({ enum: LOCK_REASONS, enumName: 'LockReason' })
  lockReason!: ContentRule['lockReason'];

  @ApiProperty({ enum: UNLOCK_PATHS, enumName: 'UnlockPath', nullable: true })
  unlockPath!: ContentRule['unlockPath'];
}

/** The content rule of each content type. */
export class ContentRulesDto {
  @ApiProperty({ type: ContentRuleDto })
  calculators!: ContentRuleDto;

  @ApiProperty({ type: ContentRuleDto })
  referenceDocuments!: ContentRuleDto;

  @ApiProperty({ type: ContentRuleDto })
  pregnancyProfiles!: ContentRuleDto;
}

/** JSON form of AccessProfile (dates as ISO strings). */
export class AccessProfileDto {
  @ApiProperty({ enum: ['AUTHENTICATED', 'DEMO'], enumName: 'AccessContext' })
  accessContext!: AccessProfile['accessContext'];

  @ApiProperty({ enum: EntitlementTier, enumName: 'EntitlementTier' })
  tier!: AccessProfile['tier'];

  @ApiProperty({ type: [FeatureDecisionDto] })
  features!: FeatureDecisionDto[];

  @ApiProperty({ type: ContentRulesDto })
  content!: ContentRulesDto;

  @ApiProperty({ format: 'date-time' })
  computedAt!: string;

  @ApiProperty({ example: '2026-09-25.1' })
  policyVersion!: string;

  /** Converts the internal profile into the response body. */
  static from(profile: AccessProfile): AccessProfileDto {
    return {
      accessContext: profile.accessContext,
      tier: profile.tier,
      features: profile.features,
      content: profile.content,
      computedAt: profile.computedAt.toISOString(),
      policyVersion: profile.policyVersion,
    };
  }
}

/** Server-computed decision attached to every item in lists, search and viewers. */
export class ItemAccessDto {
  @ApiProperty({ enum: ['AVAILABLE', 'LOCKED'], enumName: 'AccessState' })
  state!: ItemAccess['state'];

  @ApiProperty({ enum: LOCK_REASONS, enumName: 'LockReason', nullable: true })
  lockReason!: ItemAccess['lockReason'];

  @ApiProperty({ enum: UNLOCK_PATHS, enumName: 'UnlockPath', nullable: true })
  unlockPath!: ItemAccess['unlockPath'];
}
