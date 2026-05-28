import { CallHandler, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { RequestLoggingInterceptor } from './request-logging.interceptor';

describe('RequestLoggingInterceptor', () => {
  const configService = {
    get: jest.fn().mockReturnValue('test-token'),
  } as unknown as ConfigService;

  const interceptor = new RequestLoggingInterceptor(configService);
  const logSpy = jest.spyOn(interceptor['logger'], 'log').mockImplementation();

  beforeEach(() => {
    logSpy.mockClear();
  });

  function createContext(): ExecutionContext {
    const request = {
      method: 'GET',
      originalUrl: '/stores',
      headers: {
        authorization: 'Bearer test-token',
      },
    };
    const response = {
      statusCode: 200,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as ExecutionContext;
  }

  it('logs successful requests', (done) => {
    const next: CallHandler = {
      handle: () => of({ ok: true }),
    };

    interceptor.intercept(createContext(), next).subscribe({
      complete: () => {
        expect(logSpy).toHaveBeenCalledTimes(1);
        const payload = JSON.parse(String(logSpy.mock.calls[0][0]));
        expect(payload.statusCode).toBe(200);
        expect(payload.method).toBe('GET');
        expect(payload.origin).toBe('n8n');
        done();
      },
    });
  });

  it('logs failed requests with error status', (done) => {
    const next: CallHandler = {
      handle: () => throwError(() => new UnauthorizedException()),
    };

    interceptor.intercept(createContext(), next).subscribe({
      error: () => {
        expect(logSpy).toHaveBeenCalledTimes(1);
        const payload = JSON.parse(String(logSpy.mock.calls[0][0]));
        expect(payload.statusCode).toBe(401);
        done();
      },
    });
  });
});
