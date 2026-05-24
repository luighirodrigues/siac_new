import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAttendanceDto {
  @IsString()
  @IsNotEmpty()
  externalConversationId!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lastSummary?: string;

  @IsOptional()
  @IsDateString()
  lastMessageAt?: string;
}
