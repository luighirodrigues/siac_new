import { Controller, Get } from '@nestjs/common';
import { StoreResponseDto } from './dto/store-response.dto';
import { StoresService } from './stores.service';

@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get()
  findAllActive(): Promise<StoreResponseDto[]> {
    return this.storesService.findAllActive();
  }
}
