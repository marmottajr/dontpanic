import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiErrorBody } from '@dontpanic/shared';
import { marvinQuip } from '../marvin';

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

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (res && typeof res === 'object') {
        const body = res as Record<string, unknown>;
        message = (body.message as string | string[]) ?? exception.message;
        error = (body.error as string) ?? exception.name;
      }
    }

    if (status >= 500) {
      // Log the real cause server-side; never expose it to the client.
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      message = 'Internal server error';
    }

    const body: ApiErrorBody = {
      statusCode: status,
      error,
      message,
      marvin: marvinQuip(status),
      requestId: (request as { id?: string }).id,
    };

    void reply.status(status).send(body);
  }
}
