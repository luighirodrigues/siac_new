import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { IntegrationTokenGuard } from './common/auth/integration-token.guard';
import { RequestLoggingInterceptor } from './common/logging/request-logging.interceptor';
import { PrismaModule } from './prisma/prisma.module';
import { StoresModule } from './stores/stores.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, StoresModule],
  providers: [
    RequestLoggingInterceptor,
    {
      provide: APP_GUARD,
      useClass: IntegrationTokenGuard,
    },
  ],
})
export class AppModule {}
