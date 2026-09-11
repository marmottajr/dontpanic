import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import * as Sentry from '@sentry/node';
import { sessionEndReasonSchema, type ApiErrorBody } from '@dontpanic/shared';
import { marvinQuip } from '../marvin';

/**
 * The ONE field an exception may push through this filter into the response.
 *
 * The envelope is closed by default and that is the point: an exception body is
 * internal, and spreading it would make every field a thrower happens to attach
 * — ids, counters, whatever gets added next year — a public API nobody decided
 * on. So the opening is a single named key, and its value has to be one of the
 * reasons the shared contract declares; anything else is dropped without a
 * word, including a value that merely looks like a reason.
 */
function readSessionEnded(body: Record<string, unknown>): string | undefined {
  const parsed = sessionEndReasonSchema.safeParse(body.sessionEnded);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Global error envelope. Adds Marvin's deadpan flavour on non-sensitive errors,
 * never leaks internals on 5xx, and always carries the requestId for tracing.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'InternalServerError';
    let sessionEnded: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (res && typeof res === 'object') {
        const body = res as Record<string, unknown>;
        message = (body.message as string | string[]) ?? exception.message;
        error = (body.error as string) ?? exception.name;
        sessionEnded = readSessionEnded(body);
      }
    }

    if (status >= 500) {
      // Log the real cause server-side; never expose it to the client.
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      // Ship it to Sentry too (no-op when SENTRY_DSN is unset).
      Sentry.captureException(exception);
      message = 'Internal server error';
    }

    const body: ApiErrorBody = {
      statusCode: status,
      error,
      message,
      marvin: marvinQuip(status),
      requestId: (request as { id?: string }).id,
      // Only present when the session actually ended — absent, the client has
      // nothing to explain and shows its ordinary login screen.
      ...(sessionEnded ? { sessionEnded } : {}),
    };

    void reply.status(status).send(body);
  }
}
