import { Module } from '@nestjs/common';
import { AttendancesModule } from '../attendances/attendances.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [AttendancesModule],
  controllers: [MediaController],
  providers: [MediaService],
})
export class MediaModule {}
