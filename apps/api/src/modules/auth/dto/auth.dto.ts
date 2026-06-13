import { createZodDto } from 'nestjs-zod';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  twoFactorVerifySchema,
} from '@dontpanic/shared';

/**
 * Request DTOs for the auth controller. Each wraps a Zod schema from
 * @dontpanic/shared via createZodDto, so validation and Swagger docs are
 * generated from the single source of truth.
 */
export class RegisterDto extends createZodDto(registerSchema) {}
export class LoginDto extends createZodDto(loginSchema) {}
export class ForgotPasswordDto extends createZodDto(forgotPasswordSchema) {}
export class ResetPasswordDto extends createZodDto(resetPasswordSchema) {}
export class TwoFactorVerifyDto extends createZodDto(twoFactorVerifySchema) {}
