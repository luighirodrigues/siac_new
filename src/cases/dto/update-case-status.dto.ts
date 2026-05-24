import { IsEnum } from 'class-validator';

export enum UpdatableCaseStatus {
  sent_to_dkw = 'sent_to_dkw',
  in_resolution = 'in_resolution',
  resolved = 'resolved',
}

export class UpdateCaseStatusDto {
  @IsEnum(UpdatableCaseStatus)
  status!: UpdatableCaseStatus;
}
