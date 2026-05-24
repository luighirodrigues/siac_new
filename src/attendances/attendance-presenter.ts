import { Prisma } from '@prisma/client';

export const attendanceDetailInclude = Prisma.validator<Prisma.AttendanceInclude>()({
  cases: {
    orderBy: {
      createdAt: 'asc',
    },
  },
  media: {
    orderBy: {
      createdAt: 'asc',
    },
  },
  satisfactionResponse: true,
});

export type AttendanceDetail = Prisma.AttendanceGetPayload<{
  include: typeof attendanceDetailInclude;
}>;

export function toAttendanceDetail(attendance: AttendanceDetail) {
  return {
    id: attendance.id,
    externalConversationId: attendance.externalConversationId,
    status: attendance.status,
    detectedCategory: attendance.detectedCategory,
    lastSummary: attendance.lastSummary,
    closedAt: attendance.closedAt,
    closedWithoutSatisfaction: attendance.closedWithoutSatisfaction,
    cancellationReason: attendance.cancellationReason,
    satisfactionRequestedAt: attendance.satisfactionRequestedAt,
    satisfactionRespondedAt: attendance.satisfactionRespondedAt,
    cases: attendance.cases,
    media: attendance.media,
    satisfactionResponse: attendance.satisfactionResponse,
  };
}
