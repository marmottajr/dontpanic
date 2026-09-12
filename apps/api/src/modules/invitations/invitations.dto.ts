import { createZodDto } from 'nestjs-zod';
import {
  acceptInvitationSchema,
  createInvitationSchema,
  invitationListQuerySchema,
} from '@dontpanic/shared';

/**
 * Validation lives in `@dontpanic/shared` and only gets a Nest wrapper here, so
 * the API cannot drift from what the web app builds its forms against.
 */
export class CreateInvitationDto extends createZodDto(createInvitationSchema) {}
export class InvitationListQueryDto extends createZodDto(invitationListQuerySchema) {}
export class AcceptInvitationDto extends createZodDto(acceptInvitationSchema) {}
