import { createZodDto } from 'nestjs-zod';
import {
  changePlanSchema,
  extendTrialSchema,
  platformTenantListQuerySchema,
  suspendTenantSchema,
  upsertPlanSchema,
} from '@dontpanic/shared';

/** Request DTOs for the platform panel, generated from the shared contracts. */
export class PlatformTenantListQueryDto extends createZodDto(platformTenantListQuerySchema) {}
export class SuspendTenantDto extends createZodDto(suspendTenantSchema) {}
export class ExtendTrialDto extends createZodDto(extendTrialSchema) {}
export class ChangePlanDto extends createZodDto(changePlanSchema) {}
export class UpsertPlanDto extends createZodDto(upsertPlanSchema) {}
