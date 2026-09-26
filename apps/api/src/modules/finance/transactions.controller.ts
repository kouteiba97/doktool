import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DomainError } from '../../common/errors/domain-error.js';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import { ADMIN_API_PREFIX } from '../../http/api-prefix.js';
import { type AdminPrincipal, CurrentAdmin, RequireGrants } from '../admin-auth/index.js';
import { AuditService } from '../audit/index.js';
import { BillingLedgerService, type LedgerTransaction } from '../billing/index.js';
import {
  AdjustmentBody,
  AdjustmentDto,
  AdminTransactionDetailDto,
  AdminTransactionDto,
  ApproveAdjustmentBody,
  TransactionQuery,
} from './finance.dto.js';
import { feeOf } from './finance.policy.js';
import { FinanceService } from './finance.service.js';

const id = new ParseUUIDPipe();

/**
 * « Transactions » (ScreenTransactions): the immutable ledger and its drawer. The drawer's
 * `•••` holds the exceptional adjustment, Super Admin only, approved by a second admin.
 */
@ApiTags('admin-transactions')
@Controller(`${ADMIN_API_PREFIX}/transactions`)
@ApiResponse({ status: 'default', type: ErrorResponse, description: 'Error envelope' })
export class TransactionsController {
  constructor(
    private readonly ledger: BillingLedgerService,
    private readonly finance: FinanceService,
    private readonly audit: AuditService,
  ) {}

  /** 50 per page, newest first. */
  @Get()
  @RequireGrants('transactions.read')
  @ApiOkResponse({ type: [AdminTransactionDto] })
  async list(@Query() query: TransactionQuery): Promise<AdminTransactionDto[]> {
    const rates = await this.finance.feeRates();
    return (await this.ledger.transactions(query)).map((row) =>
      AdminTransactionDto.from(row, row.status === 'SUCCEEDED' ? feeOf(row, rates) : null),
    );
  }

  @Get(':id')
  @RequireGrants('transactions.read')
  @ApiOkResponse({ type: AdminTransactionDetailDto })
  async detail(@Param('id', id) transactionId: string): Promise<AdminTransactionDetailDto> {
    return this.present(await this.find(transactionId));
  }

  @Post(':id/adjustments')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('transactions.adjustment.request')
  @ApiOkResponse({ type: AdminTransactionDetailDto })
  async requestAdjustment(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', id) transactionId: string,
    @Body() body: AdjustmentBody,
    @Client() client: ClientInfo,
  ): Promise<AdminTransactionDetailDto> {
    await this.finance.requestAdjustment(admin, transactionId, body, client);
    return this.present(await this.find(transactionId));
  }

  @Post('adjustments/:adjustmentId/approve')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('transactions.adjustment.approve')
  @ApiOkResponse({ type: AdminTransactionDetailDto })
  async approveAdjustment(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('adjustmentId', id) adjustmentId: string,
    @Body() body: ApproveAdjustmentBody,
    @Client() client: ClientInfo,
  ): Promise<AdminTransactionDetailDto> {
    const approved = await this.finance.approveAdjustment(admin, adjustmentId, body.reason, client);
    return this.present(await this.find(approved.transactionId));
  }

  private async find(transactionId: string): Promise<LedgerTransaction> {
    const row = await this.ledger.transaction(transactionId);
    if (!row) throw new DomainError('NOT_FOUND', 'Transaction not found.');
    return row;
  }

  private async present(row: LedgerTransaction): Promise<AdminTransactionDetailDto> {
    const rates = await this.finance.feeRates();
    const [adjustments, history] = await Promise.all([
      this.finance.adjustmentsOf(row.id),
      this.audit.history('Transaction', row.id),
    ]);
    const metadata = row.metadata;
    return {
      ...AdminTransactionDto.from(row, row.status === 'SUCCEEDED' ? feeOf(row, rates) : null),
      metadata:
        metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata)
          ? metadata
          : {},
      adjustments: adjustments.map((adjustment) => AdjustmentDto.from(adjustment)),
      history: history.map((entry) => ({
        id: entry.id.toString(),
        action: entry.action,
        actorId: entry.actorId,
        actorType: entry.actorType,
        reason: entry.reason,
        occurredAt: entry.occurredAt.toISOString(),
      })),
    };
  }
}
