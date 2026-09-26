import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';
import type { NotificationRecord } from './notifications.service.js';

export class NotificationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'verification.decided' })
  type!: string;

  @ApiProperty({
    description: 'Catalogue key the app renders.',
    example: 'mobile.notifications.verificationApproved',
  })
  messageKey!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Values of the message placeholders, as strings (numbers in decimal).',
  })
  params!: Record<string, string>;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, type: String })
  readAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  static from(record: NotificationRecord): NotificationDto {
    return {
      id: record.id,
      type: record.type,
      messageKey: record.messageKey,
      params: Object.fromEntries(
        Object.entries(record.params).map(([key, value]) => [key, String(value)]),
      ),
      readAt: record.readAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
    };
  }
}

export class NotificationPageDto {
  @ApiProperty({ type: [NotificationDto] })
  items!: NotificationDto[];

  @ApiProperty()
  unreadCount!: number;
}

export class NotificationListQuery {
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Only notifications created before this instant (paging).',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  before?: string;
}
