-- Enforce at most one open Attendance per external conversation.
CREATE UNIQUE INDEX "Attendance_open_externalConversationId_key"
ON "Attendance" ("externalConversationId")
WHERE "status" IN ('started', 'collecting_data', 'waiting_resolution', 'pesquisa_satisfacao');

-- Enforce at most one non-cancelled Case per Attendance.
CREATE UNIQUE INDEX "SacCase_active_attendanceId_key"
ON "SacCase" ("attendanceId")
WHERE "status" <> 'cancelled';
