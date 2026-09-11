import { Global, Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { PlanLimitsService } from './services/plan-limits.service';
import { TenantsService } from './services/tenants.service';

/**
 * Tenant-facing concerns. Global because plan limits are enforced wherever a
 * resource is created, and every feature module would otherwise have to
 * remember to import this one.
 */
@Global()
@Module({
  controllers: [TenantsController],
  providers: [PlanLimitsService, TenantsService],
  exports: [PlanLimitsService, TenantsService],
})
export class TenantsModule {}
