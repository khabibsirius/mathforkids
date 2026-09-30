import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { AppError, ErrorCode, toEnvelope } from './errors';

/**
 * Every error leaving this API passes through here and comes out in one shape.
 *
 * Unknown errors are logged with their stack and reported as INTERNAL — the
 * client never sees an exception message it was not meant to, and the logs
 * never lose one.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const { status, code, message, details } = this.normalise(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${req.method} ${req.originalUrl} -> ${status} ${code}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${req.method} ${req.originalUrl} -> ${status} ${code}: ${message}`);
    }

    res.status(status).json(toEnvelope(code, message, details));
  }

  private normalise(exception: unknown): {
    status: number;
    code: ErrorCode;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof AppError) {
      return {
        status: exception.status,
        code: exception.code,
        message: exception.message,
        details: exception.meta,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002 unique violation, P2025 record not found. Both are ordinary
      // outcomes of a concurrent request, not server faults.
      if (exception.code === 'P2002') {
        const target = (exception.meta?.target as string[] | undefined)?.join(', ') ?? 'a field';
        return {
          status: 409,
          code: 'EXERCISE_ALREADY_ANSWERED',
          message: `Unique constraint on ${target}`,
        };
      }
      if (exception.code === 'P2025') {
        return { status: 404, code: 'EXERCISE_NOT_FOUND', message: 'Record not found' };
      }
      return {
        status: 400,
        code: 'VALIDATION_FAILED',
        message: `Database rejected the request (${exception.code})`,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : ((body as Record<string, unknown>)?.message as string) ?? exception.message;
      return { status, code: this.codeForStatus(status), message };
    }

    return {
      status: 500,
      code: 'INTERNAL',
      message: exception instanceof Error ? exception.message : 'Unknown error',
    };
  }

  private codeForStatus(status: number): ErrorCode {
    switch (status) {
      case 400:
      case 422:
        return 'VALIDATION_FAILED';
      case 401:
        return 'TOKEN_INVALID';
      case 403:
        return 'FORBIDDEN_CHILD';
      case 404:
        return 'EXERCISE_NOT_FOUND';
      case 409:
        return 'EXERCISE_ALREADY_ANSWERED';
      default:
        return 'INTERNAL';
    }
  }
}
