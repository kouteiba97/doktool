import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors/error-response.js';
import { ADMIN_API_PREFIX, USER_API_PREFIX } from '../../http/api-prefix.js';
import {
  CurrentViewer,
  type Viewer,
  ViewerAuthGuard,
} from '../../infrastructure/security/viewer-auth.guard.js';
import { RequireGrants } from '../admin-auth/index.js';
import {
  AnalyticsBatchDto,
  CalculatorsDashboardDto,
  DashboardQuery,
  DemoDashboardDto,
  FreshnessDto,
  IngestResultDto,
  LibraryDashboardDto,
  OnboardingDashboardDto,
  SubscriptionsDashboardDto,
  UsageDashboardDto,
} from './analytics.dto.js';
import { AnalyticsService } from './analytics.service.js';

const errors = ApiResponse({
  status: 'default',
  type: ErrorResponse,
  description: 'Error envelope',
});

/** Event upload from the app (accounts and demo sessions); the server adds the envelope. */
@ApiTags('analytics')
@Controller(`${USER_API_PREFIX}/analytics`)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** POST /v1/analytics/events: a batch of up to 100 events from the app or a demo session. */
  @Post('events')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ViewerAuthGuard)
  @ApiBearerAuth('user')
  @ApiOkResponse({ type: IngestResultDto })
  @errors
  async ingest(
    @CurrentViewer() viewer: Viewer,
    @Body() body: AnalyticsBatchDto,
  ): Promise<IngestResultDto> {
    return this.analytics.ingest(viewer, body);
  }
}

/**
 * « Analytics — DokTool Intelligence » (section 16): aggregates only, cells under 10 people
 * suppressed, demo events only in the demo funnel.
 */
@ApiTags('admin-analytics')
@Controller(`${ADMIN_API_PREFIX}/analytics`)
@ApiResponse({ status: 'default', type: ErrorResponse, description: 'Error envelope' })
export class AnalyticsAdminController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** GET /admin/v1/analytics/freshness: when the latest event arrived. */
  @Get('freshness')
  @RequireGrants('analytics.read')
  @ApiOkResponse({ type: FreshnessDto })
  async freshness(): Promise<FreshnessDto> {
    return { latestEventAt: (await this.analytics.freshness())?.toISOString() ?? null };
  }

  /** GET /admin/v1/analytics/usage: active people. */
  @Get('usage')
  @RequireGrants('analytics.read')
  @ApiOkResponse({ type: UsageDashboardDto })
  usage(@Query() query: DashboardQuery): Promise<UsageDashboardDto> {
    return this.analytics.usage(query);
  }

  /** GET /admin/v1/analytics/library: searches and reference model use. */
  @Get('library')
  @RequireGrants('analytics.read')
  @ApiOkResponse({ type: LibraryDashboardDto })
  library(@Query() query: DashboardQuery): Promise<LibraryDashboardDto> {
    return this.analytics.library(query);
  }

  /** GET /admin/v1/analytics/calculators: starts and completions per calculator version. */
  @Get('calculators')
  @RequireGrants('analytics.read')
  @ApiOkResponse({ type: CalculatorsDashboardDto })
  calculators(@Query() query: DashboardQuery): Promise<CalculatorsDashboardDto> {
    return this.analytics.calculatorUse(query);
  }

  /** GET /admin/v1/analytics/users: sign-ups and verification funnel. */
  @Get('users')
  @RequireGrants('analytics.read')
  @ApiOkResponse({ type: OnboardingDashboardDto })
  users(@Query() query: DashboardQuery): Promise<OnboardingDashboardDto> {
    return this.analytics.onboarding(query);
  }

  /** GET /admin/v1/analytics/subscriptions: plan views, starts and renewals. */
  @Get('subscriptions')
  @RequireGrants('analytics.read')
  @ApiOkResponse({ type: SubscriptionsDashboardDto })
  subscriptions(@Query() query: DashboardQuery): Promise<SubscriptionsDashboardDto> {
    return this.analytics.subscriptionActivity(query);
  }

  /** GET /admin/v1/analytics/demo: the demo funnel. */
  @Get('demo')
  @RequireGrants('analytics.read')
  @ApiOkResponse({ type: DemoDashboardDto })
  demo(@Query() query: DashboardQuery): Promise<DemoDashboardDto> {
    return this.analytics.demoFunnel(query);
  }
}
