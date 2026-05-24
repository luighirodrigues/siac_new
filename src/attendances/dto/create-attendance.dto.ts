import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAttendanceDto {
  @IsString()
  @IsNotEmpty()
  externalConversationId!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lastSummary?: string;

  /** Accepted for n8n compatibility but never persisted. */
  @IsOptional()
  @IsDateString()
  lastMessageAt?: string;
}
