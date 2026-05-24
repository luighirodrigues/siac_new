import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SAO_PAULO_TIMEZONE = 'America/Sao_Paulo';

@Injectable()
export class ProtocolService {
  constructor(private readonly prisma: PrismaService) {}

  async generateProtocol(options?: { now?: Date }): Promise<string> {
    const protocolDate = this.getSaoPauloDateKey(options?.now ?? new Date());

    const sequence = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "ProtocolSequence" ("id", "protocolDate", "lastSequence", "createdAt", "updatedAt")
        VALUES (md5(random()::text || clock_timestamp()::text), ${protocolDate}, 0, NOW(), NOW())
        ON CONFLICT ("protocolDate") DO NOTHING
      `;

      const rows = await tx.$queryRaw<{ lastSequence: number }[]>`
        UPDATE "ProtocolSequence"
        SET "lastSequence" = "lastSequence" + 1, "updatedAt" = NOW()
        WHERE "protocolDate" = ${protocolDate}
        RETURNING "lastSequence"
      `;

      return rows[0]!.lastSequence;
    });

    return this.formatProtocol(protocolDate, sequence);
  }

  private getSaoPauloDateKey(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: SAO_PAULO_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(date)
      .replace(/-/g, '');
  }

  private formatProtocol(protocolDate: string, sequence: number): string {
    return `SAC-${protocolDate}-${String(sequence).padStart(6, '0')}`;
  }
}
