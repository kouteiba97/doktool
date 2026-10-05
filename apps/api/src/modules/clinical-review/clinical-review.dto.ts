import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { ClinicalContentKind } from '../../generated/prisma/enums.js';
import type { ReviewPolicy } from './clinical-review.service.js';

class PolicyEditorDto {
  @ApiProperty() id!: string;
  @ApiProperty() fullName!: string;
}

/** How many independent sign-offs a kind of clinical content needs (ADR-024). */
export class ReviewPolicyDto {
  @ApiProperty({ enum: ClinicalContentKind, enumName: 'ClinicalContentKind' })
  content!: ClinicalContentKind;
  @ApiProperty({ enum: [1, 2] })
  requiredSignOffs!: 1 | 2;
  @ApiProperty({ description: 'Active admins who may approve this content.' })
  eligibleReviewers!: number;
  @ApiProperty({ type: PolicyEditorDto, nullable: true })
  updatedBy!: PolicyEditorDto | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  updatedAt!: string | null;

  static from(policy: ReviewPolicy): ReviewPolicyDto {
    return {
      content: policy.content,
      requiredSignOffs: policy.requiredSignOffs,
      eligibleReviewers: policy.eligibleReviewers,
      updatedBy: policy.updatedBy,
      updatedAt: policy.updatedAt?.toISOString() ?? null,
    };
  }
}

export class UpdateReviewPolicyDto {
  @ApiProperty({ enum: [1, 2] })
  @IsIn([1, 2])
  requiredSignOffs!: 1 | 2;

  @ApiProperty({ minLength: 3, maxLength: 500, description: 'Audit log.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
