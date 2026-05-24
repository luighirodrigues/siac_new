import { AttendanceCategory } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum MissingRequiredField {
  denuncianteName = 'denuncianteName',
  cpfDenunciante = 'cpfDenunciante',
  productImage = 'productImage',
  storeId = 'storeId',
  purchaseOrOccurrenceDate = 'purchaseOrOccurrenceDate',
  productName = 'productName',
  affectedArea = 'affectedArea',
  approximateDate = 'approximateDate',
  priceInfo = 'priceInfo',
}

export enum RiskReason {
  social_media = 'social_media',
  lawyer = 'lawyer',
  procon = 'procon',
  press = 'press',
  customer_loss_threat = 'customer_loss_threat',
  public_exposure = 'public_exposure',
  other = 'other',
}

export class CreateCaseDto {
  @IsString()
  @IsNotEmpty()
  attendanceId!: string;

  @IsEnum(AttendanceCategory)
  category!: AttendanceCategory;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  storeId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  rawStoreMention?: string;

  @IsOptional()
  @IsBoolean()
  needsHumanReview?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(MissingRequiredField, { each: true })
  missingRequiredFields?: MissingRequiredField[];

  @IsOptional()
  @IsBoolean()
  riskFlag?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(RiskReason, { each: true })
  riskReasons?: RiskReason[];

  @IsOptional()
  @IsBoolean()
  markAsSentToDkw?: boolean;
}
