import { Module } from '@nestjs/common';
import { CaseTransitionService } from './case-transition.service';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';
import { ProtocolService } from './protocol.service';

@Module({
  controllers: [CasesController],
  providers: [CasesService, CaseTransitionService, ProtocolService],
})
export class CasesModule {}
