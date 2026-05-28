import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StoreResponseDto } from './dto/store-response.dto';

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllActive(): Promise<StoreResponseDto[]> {
    const stores = await this.prisma.store.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });

    return stores.map((store) => ({
      id: store.id,
      internalStoreCode: store.internalStoreCode,
      name: store.name,
      city: store.city,
      state: store.state,
      address: store.address,
      operation: store.operation,
      active: store.active,
      aliases: store.aliases as string[],
    }));
  }
}
