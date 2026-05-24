import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationTokenGuard } from './integration-token.guard';

describe('IntegrationTokenGuard', () => {
  const expectedToken = 'test-token';
  let guard: IntegrationTokenGuard;
  let configService: ConfigService;

  beforeEach(() => {
    configService = {
      get: jest.fn().mockReturnValue(expectedToken),
    } as unknown as ConfigService;
    guard = new IntegrationTokenGuard(configService);
  });

  function createContext(headers: Record<string, string> = {}): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    } as ExecutionContext;
  }

  it('rejects when header is missing', () => {
    expect(() => guard.canActivate(createContext())).toThrow(UnauthorizedException);
  });

  it('rejects when token mismatches', () => {
    expect(() =>
      guard.canActivate(createContext({ authorization: 'Bearer wrong-token' })),
    ).toThrow(UnauthorizedException);
  });

  it('allows when Authorization Bearer token matches N8N_INTEGRATION_TOKEN', () => {
    expect(
      guard.canActivate(createContext({ authorization: `Bearer ${expectedToken}` })),
    ).toBe(true);
  });

  it('allows when x-integration-token matches N8N_INTEGRATION_TOKEN', () => {
    expect(
      guard.canActivate(createContext({ 'x-integration-token': expectedToken })),
    ).toBe(true);
  });
});
