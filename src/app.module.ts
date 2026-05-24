import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { IntegrationTokenGuard } from './common/auth/integration-token.guard';
import { RequestLoggingInterceptor } from './common/logging/request-logging.interceptor';
import { PrismaModule } from './prisma/prisma.module';
import { StoresModule } from './stores/stores.module';
import { AttendancesModule } from './attendances/attendances.module';
import { CasesModule } from './cases/cases.module';
import { MediaModule } from './media/media.module';
import { SatisfactionModule } from './satisfaction/satisfaction.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    StoresModule,
    AttendancesModule,
    CasesModule,
    MediaModule,
    SatisfactionModule,
  ],
  providers: [
    RequestLoggingInterceptor,
    {
      provide: APP_GUARD,
      useClass: IntegrationTokenGuard,
    },
  ],
})
export class AppModule {}
