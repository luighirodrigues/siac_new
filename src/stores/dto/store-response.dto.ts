export class StoreResponseDto {
  id!: string;
  internalStoreCode!: string;
  name!: string;
  city!: string;
  state!: string;
  address!: string;
  operation!: string | null;
  active!: boolean;
  aliases!: string[];
}
