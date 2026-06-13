import { createZodDto } from 'nestjs-zod';
import {
  updateProfileSchema,
  changePasswordSchema,
  twoFactorEnableSchema,
  twoFactorDisableSchema,
} from '@dontpanic/shared';

/**
 * Request DTOs for the users controller. Each wraps a Zod schema from
 * @dontpanic/shared via createZodDto, so validation and Swagger docs are
 * generated from the single source of truth.
 */
export class UpdateProfileDto extends createZodDto(updateProfileSchema) {}
export class ChangePasswordDto extends createZodDto(changePasswordSchema) {}
export class TwoFactorEnableDto extends createZodDto(twoFactorEnableSchema) {}
export class TwoFactorDisableDto extends createZodDto(twoFactorDisableSchema) {}
