import { CaseCancellationReason } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class CancelCaseDto {
  @IsEnum(CaseCancellationReason)
  caseCancellationReason!: CaseCancellationReason;

  @IsOptional()
  @IsBoolean()
  returnAttendanceToCollectingData?: boolean;

  @IsOptional()
  @IsBoolean()
  cancelAttendanceIfNoUsefulDemand?: boolean;
}
