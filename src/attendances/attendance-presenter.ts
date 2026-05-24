import { Media, Prisma } from '@prisma/client';

export const attendanceDetailInclude = Prisma.validator<Prisma.AttendanceInclude>()({
  cases: {
    orderBy: {
      createdAt: 'asc',
    },
    include: {
      media: {
        orderBy: {
          createdAt: 'asc',
        },
      },
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

function collectCycleMedia(attendance: AttendanceDetail): Media[] {
  const byId = new Map<string, Media>();

  for (const item of attendance.media) {
    byId.set(item.id, item);
  }

  for (const sacCase of attendance.cases) {
    for (const item of sacCase.media) {
      byId.set(item.id, item);
    }
  }

  return Array.from(byId.values()).sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );
}

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
    cases: attendance.cases.map(({ media: _media, ...sacCase }) => sacCase),
    media: collectCycleMedia(attendance),
    satisfactionResponse: attendance.satisfactionResponse,
  };
}
