import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PlatformPlansController } from './platform-plans.controller';
import { PlatformTenantsService } from './services/platform-tenants.service';
import { PlatformPlansService } from './services/platform-plans.service';
import { PlatformStatsService } from './services/platform-stats.service';
import { SuperAdminGuard } from './guards/superadmin.guard';

/**
 * The SaaS operator's area. Nothing here is reachable by a company user — the
 * guard answers 404 — and everything runs in platform scope, which crosses
 * tenants. Keep business features out of it.
 */
@Module({
  controllers: [PlatformController, PlatformPlansController],
  providers: [PlatformTenantsService, PlatformPlansService, PlatformStatsService, SuperAdminGuard],
})
export class PlatformModule {}
