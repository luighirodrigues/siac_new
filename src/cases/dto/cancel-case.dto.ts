import { CaseCancellationReason } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class CancelCaseDto {
  @IsEnum(CaseCancellationReason)
  caseCancellationReason!: CaseCancellationReason;

  @IsOptional()
  @IsString()
  lastSummary?: string;

  @IsOptional()
  @IsBoolean()
  returnAttendanceToCollectingData?: boolean;
}
