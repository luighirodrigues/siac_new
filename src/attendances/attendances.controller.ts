import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { toAttendanceDetail } from './attendance-presenter';
import { AttendancesService } from './attendances.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { ListAttendancesQueryDto } from './dto/list-attendances-query.dto';
import { PatchAttendanceDto } from './dto/patch-attendance.dto';

@Controller('sac-attendances')
export class AttendancesController {
  constructor(private readonly attendancesService: AttendancesService) {}

  @Post()
  async create(
    @Body() dto: CreateAttendanceDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.attendancesService.createOrReuse(dto);
    response.status(result.reused ? HttpStatus.OK : HttpStatus.CREATED);

    return {
      reused: result.reused,
      attendance: toAttendanceDetail(result.attendance),
    };
  }

  @Get('by-external-conversation/:externalConversationId')
  async findByExternalConversationId(@Param('externalConversationId') externalConversationId: string) {
    const attendance = await this.attendancesService.findByExternalConversationId(externalConversationId);
    return toAttendanceDetail(attendance);
  }

  @Get()
  async list(@Query() query: ListAttendancesQueryDto) {
    const attendances = await this.attendancesService.list(query);
    return attendances.map((attendance) => toAttendanceDetail(attendance));
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const attendance = await this.attendancesService.findById(id);
    return toAttendanceDetail(attendance);
  }

  @Patch(':id')
  async patch(@Param('id') id: string, @Body() dto: PatchAttendanceDto) {
    const attendance = await this.attendancesService.patch(id, dto);
    return toAttendanceDetail(attendance);
  }
}
