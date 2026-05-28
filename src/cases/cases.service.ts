import {
  AttendanceCategory,
  AttendanceStatus,
  CaseStatus,
  Prisma,
} from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUniqueConstraintError } from '../common/prisma/is-unique-constraint-error';
import { PrismaService } from '../prisma/prisma.service';
import { ProtocolService } from './protocol.service';
import {
  CreateCaseDto,
  MissingRequiredField,
  RiskReason,
} from './dto/create-case.dto';
import { MarkProtocolSentDto } from './dto/mark-protocol-sent.dto';

const CASE_CREATION_CATEGORIES: AttendanceCategory[] = [
  'DENUNCIA',
  'MAU_ATENDIMENTO',
  'ESTRUTURA_OPERACAO',
  'PRODUTO_ESTRAGADO',
  'PRODUTO_AVARIA',
  'PRODUTO_EM_FALTA',
  'PRECO_PRODUTO',
];

const NON_CASE_CATEGORIES: AttendanceCategory[] = [
  'RH',
  'DP',
  'CURRICULO',
  'FORNECEDOR',
  'INFORMACAO_LOJA',
];

const CASE_CREATION_ALLOWED_ATTENDANCE_STATUSES: AttendanceStatus[] = [
  'started',
  'collecting_data',
];

export const caseReadInclude = {
  attendance: {
    select: {
      id: true,
      status: true,
      externalConversationId: true,
      createdAt: true,
      closedAt: true,
    },
  },
  replacedByCase: {
    select: {
      id: true,
      protocol: true,
      status: true,
    },
  },
} satisfies Prisma.SacCaseInclude;

export type CaseReadEntity = Prisma.SacCaseGetPayload<{
  include: typeof caseReadInclude;
}>;

function toStringArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

export function toCaseResponse(caseItem: CaseReadEntity) {
  return {
    id: caseItem.id,
    attendanceId: caseItem.attendanceId,
    protocol: caseItem.protocol,
    category: caseItem.category,
    description: caseItem.description,
    status: caseItem.status,
    storeId: caseItem.storeId,
    rawStoreMention: caseItem.rawStoreMention,
    needsHumanReview: caseItem.needsHumanReview,
    missingRequiredFields: toStringArray(caseItem.missingRequiredFields),
    riskFlag: caseItem.riskFlag,
    riskReasons: toStringArray(caseItem.riskReasons),
    caseCancellationReason: caseItem.caseCancellationReason,
    sentToDkwAt: caseItem.sentToDkwAt,
    resolvedAt: caseItem.resolvedAt,
    cancelledAt: caseItem.cancelledAt,
    protocolSentToCustomerAt: caseItem.protocolSentToCustomerAt,
    replacedByCaseId: caseItem.replacedByCaseId,
    createdAt: caseItem.createdAt,
    updatedAt: caseItem.updatedAt,
    attendance: {
      attendanceId: caseItem.attendance.id,
      status: caseItem.attendance.status,
      externalConversationId: caseItem.attendance.externalConversationId,
      createdAt: caseItem.attendance.createdAt,
      closedAt: caseItem.attendance.closedAt,
    },
    replacedBy: caseItem.replacedByCase
      ? {
          caseId: caseItem.replacedByCase.id,
          protocol: caseItem.replacedByCase.protocol,
          status: caseItem.replacedByCase.status,
        }
      : null,
  };
}

@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly protocolService: ProtocolService,
  ) {}

  async create(dto: CreateCaseDto) {
    return this.prisma.$transaction(async (tx) => {
      const attendance = await tx.attendance.findUnique({
        where: { id: dto.attendanceId },
      });

      if (!attendance) {
        throw new NotFoundException('Attendance not found');
      }

      const existingActiveCase = await tx.sacCase.findFirst({
        where: {
          attendanceId: dto.attendanceId,
          status: {
            not: 'cancelled',
          },
        },
      });

      if (existingActiveCase) {
        throw new ConflictException('Attendance already has a non-cancelled case');
      }

      if (!CASE_CREATION_ALLOWED_ATTENDANCE_STATUSES.includes(attendance.status)) {
        throw new BadRequestException('Attendance status does not allow case creation');
      }

      if (NON_CASE_CATEGORIES.includes(dto.category)) {
        throw new BadRequestException('Category does not create a SAC case');
      }

      if (!CASE_CREATION_CATEGORIES.includes(dto.category)) {
        throw new BadRequestException('Invalid case category');
      }

      const missingRequiredFields = dto.missingRequiredFields ?? [];
      const riskReasons = dto.riskReasons ?? [];

      if ((missingRequiredFields as string[]).includes('description')) {
        throw new BadRequestException('description is not allowed in missingRequiredFields');
      }

      if (!dto.storeId && !missingRequiredFields.includes(MissingRequiredField.storeId)) {
        throw new BadRequestException('storeId is required unless informed as missing');
      }

      if (dto.storeId) {
        const store = await tx.store.findUnique({
          where: { id: dto.storeId },
          select: { id: true, active: true },
        });

        if (!store || !store.active) {
          throw new BadRequestException('storeId must reference an active store');
        }
      }

      if (dto.riskFlag === true && riskReasons.length === 0) {
        throw new BadRequestException('riskReasons is required when riskFlag=true');
      }

      const replacementCandidates = await tx.sacCase.findMany({
        where: {
          attendanceId: dto.attendanceId,
          status: 'cancelled',
          replacedByCaseId: null,
        },
      });

      if (replacementCandidates.length > 1) {
        throw new ConflictException('Ambiguous cancelled case replacement candidates');
      }

      const protocol = await this.protocolService.generateProtocol();
      const now = new Date();
      const status: CaseStatus = dto.markAsSentToDkw ? 'sent_to_dkw' : 'registered';
      const normalizedNeedsHumanReview =
        (dto.needsHumanReview ?? false) || missingRequiredFields.length > 0;
      const normalizedRiskFlag = (dto.riskFlag ?? false) || riskReasons.length > 0;

      const createdCase = await this.createCaseRecord(tx, {
        attendanceId: dto.attendanceId,
        protocol,
        category: dto.category,
        description: dto.description,
        status,
        storeId: dto.storeId ?? null,
        rawStoreMention: dto.rawStoreMention ?? null,
        needsHumanReview: normalizedNeedsHumanReview,
        missingRequiredFields,
        riskFlag: normalizedRiskFlag,
        riskReasons,
        sentToDkwAt: dto.markAsSentToDkw ? now : null,
      });

      await tx.attendance.update({
        where: { id: dto.attendanceId },
        data: { status: 'waiting_resolution' },
      });

      if (replacementCandidates.length === 1) {
        await tx.sacCase.update({
          where: { id: replacementCandidates[0].id },
          data: { replacedByCaseId: createdCase.id },
        });
      }

      const caseItem = await tx.sacCase.findUniqueOrThrow({
        where: { id: createdCase.id },
        include: caseReadInclude,
      });

      return toCaseResponse(caseItem);
    });
  }

  async findById(id: string) {
    const caseItem = await this.prisma.sacCase.findUnique({
      where: { id },
      include: caseReadInclude,
    });

    if (!caseItem) {
      throw new NotFoundException('Case not found');
    }

    return toCaseResponse(caseItem);
  }

  async findByProtocol(protocol: string) {
    const normalizedProtocol = protocol.trim();

    if (!/^SAC-\d{8}-\d{6}$/i.test(normalizedProtocol)) {
      throw new BadRequestException('Protocol must follow SAC-YYYYMMDD-000001 format');
    }

    const caseItem = await this.prisma.sacCase.findFirst({
      where: {
        protocol: {
          equals: normalizedProtocol,
          mode: 'insensitive',
        },
      },
      include: caseReadInclude,
    });

    if (!caseItem) {
      throw new NotFoundException('Case not found');
    }

    return toCaseResponse(caseItem);
  }

  async markProtocolSent(id: string, dto: MarkProtocolSentDto) {
    const caseItem = await this.prisma.sacCase.findUnique({
      where: { id },
      include: caseReadInclude,
    });

    if (!caseItem) {
      throw new NotFoundException('Case not found');
    }

    if (caseItem.protocolSentToCustomerAt) {
      return toCaseResponse(caseItem);
    }

    const sentAt = dto.sentAt ? new Date(dto.sentAt) : new Date();

    const updated = await this.prisma.sacCase.update({
      where: { id },
      data: {
        protocolSentToCustomerAt: sentAt,
      },
      include: caseReadInclude,
    });

    return toCaseResponse(updated);
  }

  async findCaseEntityById(id: string): Promise<CaseReadEntity> {
    const caseItem = await this.prisma.sacCase.findUnique({
      where: { id },
      include: caseReadInclude,
    });

    if (!caseItem) {
      throw new NotFoundException('Case not found');
    }

    return caseItem;
  }

  private async createCaseRecord(
    tx: Prisma.TransactionClient,
    data: Prisma.SacCaseUncheckedCreateInput,
  ) {
    try {
      return await tx.sacCase.create({ data });
    } catch (error) {
      if (isUniqueConstraintError(error, ['attendanceId'])) {
        throw new ConflictException('Attendance already has a non-cancelled case');
      }

      throw error;
    }
  }
}
