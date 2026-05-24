import { MediaPurpose } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateMediaDto {
  @ValidateIf((dto: CreateMediaDto) => !dto.externalConversationId)
  @IsString()
  @IsNotEmpty()
  attendanceId?: string;

  @ValidateIf((dto: CreateMediaDto) => !dto.attendanceId)
  @IsString()
  @IsNotEmpty()
  externalConversationId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  caseId?: string;

  @IsString()
  @IsNotEmpty()
  externalMediaId!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  storageProvider?: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  storageStatus?: string;

  @IsOptional()
  @IsString()
  internalObjectKey?: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  size?: number;

  @IsOptional()
  @IsEnum(MediaPurpose)
  purpose?: MediaPurpose;
}
