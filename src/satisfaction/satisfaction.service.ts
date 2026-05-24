import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSatisfactionResponseDto } from './dto/create-satisfaction-response.dto';

@Injectable()
export class SatisfactionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(attendanceId: string, dto: CreateSatisfactionResponseDto) {
    const attendance = await this.prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: {
        satisfactionResponse: true,
      },
    });

    if (!attendance) {
      throw new NotFoundException('Attendance not found');
    }

    if (attendance.satisfactionResponse) {
      throw new ConflictException('Attendance already has a satisfaction response');
    }

    if (attendance.status !== 'pesquisa_satisfacao') {
      throw new BadRequestException(
        'Satisfaction response can only be received in pesquisa_satisfacao',
      );
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const satisfactionResponse = await tx.satisfactionResponse.create({
        data: {
          attendanceId,
          problemResolvedByCustomer: dto.problemResolvedByCustomer,
          rating: dto.rating,
          comment: dto.comment ?? null,
        },
      });

      await tx.attendance.update({
        where: { id: attendanceId },
        data: {
          status: 'fechado',
          satisfactionRespondedAt: now,
          closedAt: now,
        },
      });

      return satisfactionResponse;
    });
  }
}
