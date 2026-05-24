import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class IntegrationTokenGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const expectedToken = this.configService.get<string>('N8N_INTEGRATION_TOKEN');
    const token = this.extractToken(request);

    if (!expectedToken || !token || token !== expectedToken) {
      throw new UnauthorizedException();
    }

    return true;
  }

  private extractToken(request: Request): string | undefined {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith('Bearer ')) {
      return authorization.slice('Bearer '.length).trim();
    }

    const headerToken = request.headers['x-integration-token'];
    if (typeof headerToken === 'string') {
      return headerToken.trim();
    }

    return undefined;
  }
}
