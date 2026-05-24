import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Media } from '@prisma/client';
import { AttendancesService } from '../attendances/attendances.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMediaDto } from './dto/create-media.dto';

const DEFAULT_STORAGE_PROVIDER = 'external';

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendancesService: AttendancesService,
  ) {}

  async register(dto: CreateMediaDto): Promise<{ media: Media; created: boolean }> {
    if (!dto.attendanceId && !dto.externalConversationId) {
      throw new BadRequestException('attendanceId or externalConversationId is required');
    }

    const storageProvider = dto.storageProvider ?? DEFAULT_STORAGE_PROVIDER;

    const existing = await this.prisma.media.findUnique({
      where: {
        storageProvider_externalMediaId: {
          storageProvider,
          externalMediaId: dto.externalMediaId,
        },
      },
    });

    if (existing) {
      return { media: existing, created: false };
    }

    const attendanceId = await this.resolveAttendanceId(dto);
    const attendance = await this.prisma.attendance.findUnique({
      where: { id: attendanceId },
    });

    if (!attendance) {
      throw new NotFoundException('Attendance not found');
    }

    if (attendance.status === 'pesquisa_satisfacao') {
      throw new BadRequestException('Media cannot be attached during pesquisa_satisfacao');
    }

    if (dto.caseId) {
      const sacCase = await this.prisma.sacCase.findUnique({
        where: { id: dto.caseId },
      });

      if (!sacCase) {
        throw new NotFoundException('Case not found');
      }

      if (sacCase.attendanceId !== attendanceId) {
        throw new BadRequestException('Case does not belong to Attendance');
      }
    }

    const media = await this.prisma.media.create({
      data: {
        attendanceId,
        caseId: dto.caseId ?? null,
        externalMediaId: dto.externalMediaId,
        storageProvider,
        sourceUrl: dto.sourceUrl ?? null,
        storageStatus: dto.storageStatus ?? null,
        internalObjectKey: dto.internalObjectKey ?? null,
        mimeType: dto.mimeType ?? null,
        size: dto.size ?? null,
        purpose: dto.purpose ?? null,
      },
    });

    return { media, created: true };
  }

  private async resolveAttendanceId(dto: CreateMediaDto): Promise<string> {
    if (dto.attendanceId) {
      return dto.attendanceId;
    }

    const result = await this.attendancesService.createOrReuse({
      externalConversationId: dto.externalConversationId!,
    });

    return result.attendance.id;
  }
}
