import { Module } from '@nestjs/common';
import { SatisfactionController } from './satisfaction.controller';
import { SatisfactionService } from './satisfaction.service';

@Module({
  controllers: [SatisfactionController],
  providers: [SatisfactionService],
})
export class SatisfactionModule {}
