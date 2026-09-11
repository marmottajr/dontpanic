import { createZodDto } from 'nestjs-zod';
import { tenantBrandingSchema, updateTenantSchema } from '@dontpanic/shared';

/** Request DTOs for the tenant self-service endpoints. */
export class UpdateTenantDto extends createZodDto(updateTenantSchema) {}
export class TenantBrandingDto extends createZodDto(tenantBrandingSchema) {}
