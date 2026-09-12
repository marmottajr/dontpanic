import { createZodDto } from 'nestjs-zod';
import { paginationQuerySchema, updateRoleSchema } from '@dontpanic/shared';

export class PaginationQueryDto extends createZodDto(paginationQuerySchema) {}
export class UpdateRoleDto extends createZodDto(updateRoleSchema) {}
