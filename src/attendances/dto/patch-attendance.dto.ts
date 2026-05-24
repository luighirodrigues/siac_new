import {
  AttendanceCancellationReason,
  AttendanceCategory,
  AttendanceStatus,
} from '@prisma/client';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PatchAttendanceDto {
  @IsEnum(AttendanceStatus)
  status!: AttendanceStatus;

  @IsOptional()
  @IsEnum(AttendanceCancellationReason)
  cancellationReason?: AttendanceCancellationReason;

  @IsOptional()
  @IsEnum(AttendanceCategory)
  detectedCategory?: AttendanceCategory;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lastSummary?: string;

  @IsOptional()
  @IsBoolean()
  closedWithoutSatisfaction?: boolean;
}
