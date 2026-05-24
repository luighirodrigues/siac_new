import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CaseTransitionService } from './case-transition.service';
import { CasesService } from './cases.service';
import { CancelCaseDto } from './dto/cancel-case.dto';
import { CreateCaseDto } from './dto/create-case.dto';
import { MarkProtocolSentDto } from './dto/mark-protocol-sent.dto';
import { UpdateCaseStatusDto } from './dto/update-case-status.dto';

@Controller('sac-cases')
export class CasesController {
  constructor(
    private readonly casesService: CasesService,
    private readonly caseTransitionService: CaseTransitionService,
  ) {}

  @Post()
  async create(@Body() dto: CreateCaseDto) {
    return this.casesService.create(dto);
  }

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateCaseStatusDto) {
    return this.caseTransitionService.updateStatus(id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(@Param('id') id: string, @Body() dto: CancelCaseDto) {
    return this.caseTransitionService.cancel(id, dto);
  }

  @Post(':id/protocol-sent')
  @HttpCode(200)
  async markProtocolSent(@Param('id') id: string, @Body() dto: MarkProtocolSentDto) {
    return this.casesService.markProtocolSent(id, dto);
  }

  @Get('by-protocol/:protocol')
  async findByProtocol(@Param('protocol') protocol: string) {
    return this.casesService.findByProtocol(protocol);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.casesService.findById(id);
  }

  @Get()
  listDisabled() {
    throw new NotFoundException('Route not found');
  }
}
