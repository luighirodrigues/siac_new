import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CreateSatisfactionResponseDto } from './dto/create-satisfaction-response.dto';
import { SatisfactionService } from './satisfaction.service';

@Controller('sac-attendances')
export class SatisfactionController {
  constructor(private readonly satisfactionService: SatisfactionService) {}

  @Post(':attendanceId/satisfaction-response')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('attendanceId') attendanceId: string,
    @Body() dto: CreateSatisfactionResponseDto,
  ) {
    return this.satisfactionService.create(attendanceId, dto);
  }
}
