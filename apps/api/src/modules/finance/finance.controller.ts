import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { Client, type ClientInfo } from '../../common/http/client-info.js';
import { PaymentProvider } from '../../generated/prisma/enums.js';
import { ADMIN_API_PREFIX } from '../../http/api-prefix.js';
import { type AdminPrincipal, CurrentAdmin, RequireGrants } from '../admin-auth/index.js';
import {
  ExpenseDto,
  FeeRateBody,
  FeeRateDto,
  FeeSettlementBody,
  FeeSettlementResultDto,
  FinanceOverviewDto,
  NewExpenseBody,
  PeriodQuery,
  ReportQuery,
  VoidExpenseBody,
} from './finance.dto.js';
import { FinanceService, type ReportKind } from './finance.service.js';

const REPORTS: ReportKind[] = ['revenue-by-plan', 'subscriptions', 'provider-fees'];

/** « Finance » of Admin Web (ScreenAdminRevenue · ScreenExpenses · reports), section 15. */
@ApiTags('admin-finance')
@Controller(`${ADMIN_API_PREFIX}/finance`)
@ApiResponse({ status: 'default', type: ErrorResponse, description: 'Error envelope' })
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('overview')
  @RequireGrants('finance.read')
  @ApiOkResponse({ type: FinanceOverviewDto })
  async overview(@Query() query: PeriodQuery): Promise<FinanceOverviewDto> {
    return FinanceOverviewDto.from(await this.finance.overview(query));
  }

  @Get('fee-rates')
  @RequireGrants('finance.read')
  @ApiOkResponse({ type: [FeeRateDto] })
  async feeRates(): Promise<FeeRateDto[]> {
    return (await this.finance.feeRateRows()).map(({ provider, rate }) => ({
      provider,
      rateBps: rate?.rateBps ?? null,
      fixedMinor: rate?.fixedMinor ?? null,
      updatedBy: rate?.updatedBy ?? null,
      updatedAt: rate?.updatedAt.toISOString() ?? null,
    }));
  }

  @Put('fee-rates/:provider')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireGrants('finance.expenses.write')
  @ApiParam({ name: 'provider', enum: PaymentProvider, enumName: 'PaymentProvider' })
  @ApiNoContentResponse()
  async setFeeRate(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('provider', new ParseEnumPipe(PaymentProvider)) provider: PaymentProvider,
    @Body() body: FeeRateBody,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.finance.setFeeRate(
      admin,
      provider,
      { rateBps: body.rateBps, fixedMinor: body.fixedMinor },
      body.reason,
      client,
    );
  }

  @Get('expenses')
  @RequireGrants('finance.read')
  @ApiOkResponse({ type: [ExpenseDto] })
  async expenses(@Query() query: PeriodQuery): Promise<ExpenseDto[]> {
    this.finance.assertPeriod(query);
    return (await this.finance.expenses(query)).map((row) => ExpenseDto.from(row));
  }

  @Post('expenses')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('finance.expenses.write')
  @ApiOkResponse({ type: ExpenseDto })
  async addExpense(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() body: NewExpenseBody,
    @Client() client: ClientInfo,
  ): Promise<ExpenseDto> {
    return ExpenseDto.from(await this.finance.addExpense(admin, body, client));
  }

  @Post('expenses/:id/void')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('finance.expenses.write')
  @ApiOkResponse({ type: ExpenseDto })
  async voidExpense(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: VoidExpenseBody,
    @Client() client: ClientInfo,
  ): Promise<ExpenseDto> {
    return ExpenseDto.from(await this.finance.voidExpense(admin, id, body.reason, client));
  }

  /** Actual fees from the provider's statement replace the estimates. */
  @Post('fee-settlements')
  @HttpCode(HttpStatus.OK)
  @RequireGrants('finance.expenses.write')
  @ApiOkResponse({ type: [FeeSettlementResultDto] })
  async settleFees(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() body: FeeSettlementBody,
    @Client() client: ClientInfo,
  ): Promise<FeeSettlementResultDto[]> {
    return (await this.finance.settleFees(admin, body.items, body.reason, client)).map(
      ({ transactionId, outcome }) => ({ transactionId, outcome }),
    );
  }

  /** CSV with the metric definitions on its first lines (section 15). */
  @Get('reports/:kind')
  @RequireGrants('finance.reports.export')
  @ApiParam({ name: 'kind', enum: REPORTS })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV (UTF-8, `;` separated).', schema: { type: 'string' } })
  @Header('Cache-Control', 'no-store')
  async report(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('kind', new ParseEnumPipe(REPORTS)) kind: ReportKind,
    @Query() query: ReportQuery,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const csv = await this.finance.report(kind, query, query.locale ?? 'FR', admin, client);
    const from = query.from.toISOString().slice(0, 10);
    const to = new Date(query.to.getTime() - 1).toISOString().slice(0, 10);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="doktool-${kind}-${from}-${to}.csv"`,
    );
    return csv;
  }
}
