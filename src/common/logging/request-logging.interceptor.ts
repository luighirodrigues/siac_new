import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { Observable, tap } from 'rxjs';

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

    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          JSON.stringify({
            requestId,
            method: request.method,
            url: request.originalUrl,
            statusCode: response.statusCode,
            durationMs: Date.now() - startedAt,
            origin,
          }),
        );
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
