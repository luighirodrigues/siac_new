import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { Observable, catchError, tap, throwError } from 'rxjs';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly configService: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const requestId = randomUUID();
    const startedAt = Date.now();

    request.headers['x-request-id'] = requestId;

    const origin = this.hasIntegrationToken(request) ? 'n8n' : 'unknown';

    const log = (statusCode: number) => {
      this.logger.log(
        JSON.stringify({
          requestId,
          method: request.method,
          url: request.originalUrl,
          statusCode,
          durationMs: Date.now() - startedAt,
          origin,
        }),
      );
    };

    return next.handle().pipe(
      tap(() => {
        log(response.statusCode);
      }),
      catchError((error: unknown) => {
        const statusCode =
          error instanceof HttpException ? error.getStatus() : 500;
        log(statusCode);
        return throwError(() => error);
      }),
    );
  }

  private hasIntegrationToken(request: Request): boolean {
    const expectedToken = this.configService.get<string>('N8N_INTEGRATION_TOKEN');
    if (!expectedToken) {
      return false;
    }

    const authorization = request.headers.authorization;
    if (authorization === `Bearer ${expectedToken}`) {
      return true;
    }

    return request.headers['x-integration-token'] === expectedToken;
  }
}
