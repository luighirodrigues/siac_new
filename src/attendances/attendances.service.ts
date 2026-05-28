import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AttendanceCategory,
  AttendanceStatus,
  Prisma,
} from '@prisma/client';
import { isUniqueConstraintError } from '../common/prisma/is-unique-constraint-error';
import { PrismaService } from '../prisma/prisma.service';
import { attendanceDetailInclude, AttendanceDetail } from './attendance-presenter';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { ListAttendancesQueryDto } from './dto/list-attendances-query.dto';
import { PatchAttendanceDto } from './dto/patch-attendance.dto';

const OPEN_STATUSES: AttendanceStatus[] = [
  'started',
  'collecting_data',
  'waiting_resolution',
  'pesquisa_satisfacao',
];

const CANCELLABLE_STATUSES: AttendanceStatus[] = ['started', 'collecting_data'];

const CASE_REQUIRED_CATEGORIES: AttendanceCategory[] = [
  'DENUNCIA',
  'MAU_ATENDIMENTO',
  'ESTRUTURA_OPERACAO',
  'PRODUTO_ESTRAGADO',
  'PRODUTO_AVARIA',
  'PRODUTO_EM_FALTA',
  'PRECO_PRODUTO',
];

const ORIENTATIVE_CATEGORIES: AttendanceCategory[] = [
  'RH',
  'DP',
  'CURRICULO',
  'FORNECEDOR',
  'INFORMACAO_LOJA',
];

@Injectable()
export class AttendancesService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrReuse(dto: CreateAttendanceDto): Promise<{ attendance: AttendanceDetail; reused: boolean }> {
    const reusable = await this.findOpenAttendance(dto.externalConversationId);

    if (reusable) {
      const updated = await this.prisma.attendance.update({
        where: { id: reusable.id },
        data: {
          ...(dto.lastSummary !== undefined ? { lastSummary: dto.lastSummary } : {}),
        },
        include: attendanceDetailInclude,
      });

      return { attendance: updated, reused: true };
    }

    try {
      const created = await this.prisma.attendance.create({
        data: {
          externalConversationId: dto.externalConversationId,
          ...(dto.lastSummary !== undefined ? { lastSummary: dto.lastSummary } : {}),
        },
        include: attendanceDetailInclude,
      });

      return { attendance: created, reused: false };
    } catch (error) {
      if (isUniqueConstraintError(error, ['externalConversationId'])) {
        const existing = await this.findOpenAttendance(dto.externalConversationId);
        if (existing) {
          const updated =
            dto.lastSummary !== undefined
              ? await this.prisma.attendance.update({
                  where: { id: existing.id },
                  data: { lastSummary: dto.lastSummary },
                  include: attendanceDetailInclude,
                })
              : existing;

          return { attendance: updated, reused: true };
        }
      }

      throw error;
    }
  }

  private async findOpenAttendance(externalConversationId: string) {
    return this.prisma.attendance.findFirst({
      where: {
        externalConversationId,
        status: {
          in: OPEN_STATUSES,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: attendanceDetailInclude,
    });
  }

  async findByExternalConversationId(externalConversationId: string): Promise<AttendanceDetail> {
    const attendance = await this.prisma.attendance.findFirst({
      where: {
        externalConversationId,
        status: {
          in: OPEN_STATUSES,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: attendanceDetailInclude,
    });

    if (!attendance) {
      throw new NotFoundException('Open attendance not found');
    }

    return attendance;
  }

  async list(query: ListAttendancesQueryDto): Promise<AttendanceDetail[]> {
    const where: Prisma.AttendanceWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.externalConversationId) {
      where.externalConversationId = query.externalConversationId;
    }

    if (query.createdFrom || query.createdTo) {
      where.createdAt = {
        ...(query.createdFrom ? { gte: query.createdFrom } : {}),
        ...(query.createdTo ? { lte: query.createdTo } : {}),
      };
    }

    if (query.hasCase === true) {
      where.cases = {
        some: {
          status: { not: 'cancelled' },
        },
      };
    }

    if (query.hasCase === false) {
      where.NOT = {
        cases: {
          some: {
            status: { not: 'cancelled' },
          },
        },
      };
    }

    const take = Math.min(query.limit ?? 20, 100);
    const page = query.page ?? 1;
    const skip = (page - 1) * take;

    return this.prisma.attendance.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take,
      skip,
      include: attendanceDetailInclude,
    });
  }

  async findById(id: string): Promise<AttendanceDetail> {
    const attendance = await this.prisma.attendance.findUnique({
      where: { id },
      include: attendanceDetailInclude,
    });

    if (!attendance) {
      throw new NotFoundException('Attendance not found');
    }

    return attendance;
  }

  async patch(id: string, dto: PatchAttendanceDto): Promise<AttendanceDetail> {
    const attendance = await this.findById(id);

    if (dto.status === 'cancelled') {
      return this.cancelAttendance(attendance, dto);
    }

    if (dto.status === 'fechado') {
      if (dto.closedWithoutSatisfaction === true) {
        return this.closeWithoutSatisfaction(attendance, dto);
      }

      return this.closeWithoutCase(attendance, dto);
    }

    throw new BadRequestException('Unsupported patch transition');
  }

  private async cancelAttendance(attendance: AttendanceDetail, dto: PatchAttendanceDto) {
    if (!CANCELLABLE_STATUSES.includes(attendance.status)) {
      throw new BadRequestException('Attendance cannot be cancelled from current status');
    }

    if (!dto.cancellationReason) {
      throw new BadRequestException('cancellationReason is required');
    }

    if (dto.cancellationReason === 'other' && !dto.lastSummary) {
      throw new BadRequestException('lastSummary is required when cancellationReason is other');
    }

    return this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        status: 'cancelled',
        cancellationReason: dto.cancellationReason,
        closedAt: new Date(),
        closedWithoutSatisfaction: false,
        ...(dto.lastSummary !== undefined ? { lastSummary: dto.lastSummary } : {}),
      },
      include: attendanceDetailInclude,
    });
  }

  private async closeWithoutCase(attendance: AttendanceDetail, dto: PatchAttendanceDto) {
    if (attendance.status === 'cancelled' || attendance.status === 'fechado') {
      throw new BadRequestException('Attendance is already closed');
    }

    if (attendance.status === 'pesquisa_satisfacao') {
      throw new BadRequestException('Use closedWithoutSatisfaction to close from pesquisa_satisfacao');
    }

    if (!dto.detectedCategory) {
      throw new BadRequestException('detectedCategory is required');
    }

    if (!dto.lastSummary) {
      throw new BadRequestException('lastSummary is required');
    }

    if (CASE_REQUIRED_CATEGORIES.includes(dto.detectedCategory)) {
      throw new BadRequestException('Category requires case creation');
    }

    if (!ORIENTATIVE_CATEGORIES.includes(dto.detectedCategory)) {
      throw new BadRequestException('Invalid orientative category');
    }

    const hasNonCancelledCase = attendance.cases.some((item) => item.status !== 'cancelled');
    if (hasNonCancelledCase) {
      throw new BadRequestException('Attendance has active case');
    }

    return this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        status: 'fechado',
        detectedCategory: dto.detectedCategory,
        lastSummary: dto.lastSummary,
        closedAt: new Date(),
        closedWithoutSatisfaction: false,
        cancellationReason: null,
      },
      include: attendanceDetailInclude,
    });
  }

  private async closeWithoutSatisfaction(attendance: AttendanceDetail, dto: PatchAttendanceDto) {
    if (attendance.status !== 'pesquisa_satisfacao') {
      throw new BadRequestException('Only pesquisa_satisfacao can be closed without satisfaction');
    }

    if (dto.closedWithoutSatisfaction !== true) {
      throw new BadRequestException('closedWithoutSatisfaction=true is required');
    }

    return this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        status: 'fechado',
        closedWithoutSatisfaction: true,
        closedAt: new Date(),
      },
      include: attendanceDetailInclude,
    });
  }
}
