import { createZodDto } from 'nestjs-zod';
import { completeOAuthSignupSchema } from '@dontpanic/shared';

/**
 * The only OAuth route with a body we validate.
 *
 * The callbacks deliberately have no DTO: their parameters are written by
 * Google, Apple and GitHub, and a Zod pipe rejecting an unexpected field would
 * answer a browser navigation with a JSON 400 instead of sending the user back
 * to the login screen. They are read defensively in the controller instead.
 */
export class CompleteOAuthSignupDto extends createZodDto(completeOAuthSignupSchema) {}
