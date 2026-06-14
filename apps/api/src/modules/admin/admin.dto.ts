import { createZodDto } from 'nestjs-zod';
import { adminCreateUserSchema, paginationQuerySchema, updateRoleSchema } from '@dontpanic/shared';

export class PaginationQueryDto extends createZodDto(paginationQuerySchema) {}
export class UpdateRoleDto extends createZodDto(updateRoleSchema) {}
export class AdminCreateUserDto extends createZodDto(adminCreateUserSchema) {}
