import { IsDateString, IsOptional } from 'class-validator';

export class MarkProtocolSentDto {
  @IsOptional()
  @IsDateString()
  sentAt?: string;
}
