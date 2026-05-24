import {
  AttendanceStatus,
  CaseCancellationReason,
  CaseStatus,
  Prisma,
} from '@prisma/client';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { caseReadInclude, toCaseResponse } from './cases.service';
import { CancelCaseDto } from './dto/cancel-case.dto';
import {
  UpdatableCaseStatus,
  UpdateCaseStatusDto,
} from './dto/update-case-status.dto';

const RETURN_TO_COLLECTING_ALLOWED_REASONS: CaseCancellationReason[] = [
  'created_by_mistake',
  'wrong_routing',
];

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class CaseTransitionService {
  constructor(private readonly prisma: PrismaService) {}

  async updateStatus(id: string, dto: UpdateCaseStatusDto) {
    return this.prisma.$transaction(async (tx) => {
      const caseItem = await this.findCaseOrFail(tx, id);

      if (dto.status === UpdatableCaseStatus.sent_to_dkw) {
        const updated = await this.moveToSentToDkw(tx, caseItem);
        return toCaseResponse(updated);
      }

      if (dto.status === UpdatableCaseStatus.in_resolution) {
        const updated = await this.moveToInResolution(tx, caseItem);
        return toCaseResponse(updated);
      }

      const updated = await this.moveToResolved(tx, caseItem);
      return toCaseResponse(updated);
    });
  }

  async cancel(id: string, dto: CancelCaseDto) {
    return this.prisma.$transaction(async (tx) => {
      const caseItem = await this.findCaseOrFail(tx, id);

      if (caseItem.status === 'resolved') {
        throw new BadRequestException('Resolved case cannot be cancelled');
      }

      if (
        dto.returnAttendanceToCollectingData === true &&
        !RETURN_TO_COLLECTING_ALLOWED_REASONS.includes(dto.caseCancellationReason)
      ) {
        throw new BadRequestException(
          'returnAttendanceToCollectingData is only allowed for created_by_mistake or wrong_routing',
        );
      }

      const now = new Date();

      if (caseItem.status !== 'cancelled') {
        await tx.sacCase.update({
          where: { id: caseItem.id },
          data: {
            status: 'cancelled',
            caseCancellationReason: dto.caseCancellationReason,
            cancelledAt: caseItem.cancelledAt ?? now,
          },
        });
      }

      if (dto.returnAttendanceToCollectingData === true) {
        await tx.attendance.update({
          where: { id: caseItem.attendanceId },
          data: {
            status: 'collecting_data',
            closedAt: null,
            cancellationReason: null,
            closedWithoutSatisfaction: false,
            satisfactionRequestedAt: null,
            satisfactionRespondedAt: null,
          },
        });
      } else if (dto.cancelAttendanceIfNoUsefulDemand === true) {
        const activeCasesCount = await tx.sacCase.count({
          where: {
            attendanceId: caseItem.attendanceId,
            status: {
              not: 'cancelled',
            },
          },
        });

        if (activeCasesCount === 0) {
          await tx.attendance.update({
            where: { id: caseItem.attendanceId },
            data: {
              status: 'cancelled',
              cancellationReason: 'operational_duplicate',
              closedAt: now,
              closedWithoutSatisfaction: false,
            },
          });
        }
      }

      const updated = await this.findCaseOrFail(tx, id);
      return toCaseResponse(updated);
    });
  }

  private async moveToSentToDkw(tx: TransactionClient, caseItem: Prisma.SacCaseGetPayload<{
    include: typeof caseReadInclude;
  }>) {
    if (caseItem.status === 'sent_to_dkw') {
      return caseItem;
    }

    if (caseItem.status === 'resolved' || caseItem.status === 'cancelled') {
      throw new BadRequestException('sent_to_dkw transition is not allowed from current status');
    }

    if (caseItem.status !== 'registered') {
      throw new BadRequestException('sent_to_dkw transition is not allowed from current status');
    }

    return tx.sacCase.update({
      where: { id: caseItem.id },
      data: {
        status: 'sent_to_dkw',
        sentToDkwAt: caseItem.sentToDkwAt ?? new Date(),
      },
      include: caseReadInclude,
    });
  }

  private async moveToInResolution(tx: TransactionClient, caseItem: Prisma.SacCaseGetPayload<{
    include: typeof caseReadInclude;
  }>) {
    if (caseItem.status === 'in_resolution') {
      return caseItem;
    }

    if (caseItem.status === 'resolved' || caseItem.status === 'cancelled') {
      throw new BadRequestException('in_resolution transition is not allowed from current status');
    }

    if (!['registered', 'sent_to_dkw'].includes(caseItem.status)) {
      throw new BadRequestException('in_resolution transition is not allowed from current status');
    }

    return tx.sacCase.update({
      where: { id: caseItem.id },
      data: {
        status: 'in_resolution',
      },
      include: caseReadInclude,
    });
  }

  private async moveToResolved(tx: TransactionClient, caseItem: Prisma.SacCaseGetPayload<{
    include: typeof caseReadInclude;
  }>) {
    if (caseItem.status === 'cancelled') {
      throw new BadRequestException('resolved transition is not allowed from current status');
    }

    if (
      !['registered', 'sent_to_dkw', 'in_resolution', 'resolved'].includes(caseItem.status)
    ) {
      throw new BadRequestException('resolved transition is not allowed from current status');
    }

    let updatedCase = caseItem;
    if (caseItem.status !== 'resolved') {
      updatedCase = await tx.sacCase.update({
        where: { id: caseItem.id },
        data: {
          status: 'resolved',
          resolvedAt: caseItem.resolvedAt ?? new Date(),
        },
        include: caseReadInclude,
      });
    }

    await this.moveAttendanceToSatisfaction(tx, updatedCase.attendanceId);

    return this.findCaseOrFail(tx, updatedCase.id);
  }

  private async moveAttendanceToSatisfaction(
    tx: TransactionClient,
    attendanceId: string,
  ) {
    const attendance = await tx.attendance.findUnique({
      where: { id: attendanceId },
      select: {
        status: true,
        satisfactionRequestedAt: true,
      },
    });

    if (!attendance) {
      throw new NotFoundException('Attendance not found');
    }

    const updatableStatuses: AttendanceStatus[] = [
      'started',
      'collecting_data',
      'waiting_resolution',
      'pesquisa_satisfacao',
    ];

    if (!updatableStatuses.includes(attendance.status)) {
      return;
    }

    await tx.attendance.update({
      where: { id: attendanceId },
      data: {
        status: 'pesquisa_satisfacao',
        satisfactionRequestedAt: attendance.satisfactionRequestedAt ?? new Date(),
      },
    });
  }

  private async findCaseOrFail(tx: TransactionClient, id: string) {
    const caseItem = await tx.sacCase.findUnique({
      where: { id },
      include: caseReadInclude,
    });

    if (!caseItem) {
      throw new NotFoundException('Case not found');
    }

    return caseItem;
  }
}
