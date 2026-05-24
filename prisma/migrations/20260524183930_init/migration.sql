-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('started', 'collecting_data', 'waiting_resolution', 'pesquisa_satisfacao', 'fechado', 'cancelled');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('registered', 'sent_to_dkw', 'in_resolution', 'resolved', 'cancelled');

-- CreateEnum
CREATE TYPE "AttendanceCategory" AS ENUM ('DENUNCIA', 'MAU_ATENDIMENTO', 'ESTRUTURA_OPERACAO', 'PRODUTO_ESTRAGADO', 'PRODUTO_AVARIA', 'PRODUTO_EM_FALTA', 'RH', 'DP', 'CURRICULO', 'FORNECEDOR', 'PRECO_PRODUTO', 'INFORMACAO_LOJA');

-- CreateEnum
CREATE TYPE "AttendanceCancellationReason" AS ENUM ('customer_gave_up', 'operational_duplicate', 'invalid_message', 'spam', 'timeout', 'other');

-- CreateEnum
CREATE TYPE "CaseCancellationReason" AS ENUM ('operational_duplicate', 'created_by_mistake', 'wrong_routing', 'other');

-- CreateEnum
CREATE TYPE "MediaPurpose" AS ENUM ('productImage', 'receiptImage', 'storePhoto', 'other');

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "internalStoreCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "aliases" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "externalConversationId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'started',
    "detectedCategory" "AttendanceCategory",
    "lastSummary" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedWithoutSatisfaction" BOOLEAN NOT NULL DEFAULT false,
    "cancellationReason" "AttendanceCancellationReason",
    "satisfactionRequestedAt" TIMESTAMP(3),
    "satisfactionRespondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SacCase" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "category" "AttendanceCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'registered',
    "storeId" TEXT,
    "rawStoreMention" TEXT,
    "needsHumanReview" BOOLEAN NOT NULL DEFAULT false,
    "missingRequiredFields" JSONB NOT NULL DEFAULT '[]',
    "riskFlag" BOOLEAN NOT NULL DEFAULT false,
    "riskReasons" JSONB NOT NULL DEFAULT '[]',
    "caseCancellationReason" "CaseCancellationReason",
    "sentToDkwAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "protocolSentToCustomerAt" TIMESTAMP(3),
    "replacedByCaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SacCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "caseId" TEXT,
    "externalMediaId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "storageProvider" TEXT NOT NULL DEFAULT 'external',
    "storageStatus" TEXT,
    "internalObjectKey" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "purpose" "MediaPurpose",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SatisfactionResponse" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "problemResolvedByCustomer" BOOLEAN NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SatisfactionResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProtocolSequence" (
    "id" TEXT NOT NULL,
    "protocolDate" TEXT NOT NULL,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProtocolSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_internalStoreCode_key" ON "Store"("internalStoreCode");

-- CreateIndex
CREATE INDEX "Attendance_externalConversationId_idx" ON "Attendance"("externalConversationId");

-- CreateIndex
CREATE INDEX "Attendance_status_idx" ON "Attendance"("status");

-- CreateIndex
CREATE INDEX "Attendance_createdAt_idx" ON "Attendance"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SacCase_protocol_key" ON "SacCase"("protocol");

-- CreateIndex
CREATE INDEX "SacCase_attendanceId_idx" ON "SacCase"("attendanceId");

-- CreateIndex
CREATE INDEX "SacCase_status_idx" ON "SacCase"("status");

-- CreateIndex
CREATE INDEX "SacCase_protocol_idx" ON "SacCase"("protocol");

-- CreateIndex
CREATE INDEX "Media_attendanceId_idx" ON "Media"("attendanceId");

-- CreateIndex
CREATE INDEX "Media_caseId_idx" ON "Media"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "Media_storageProvider_externalMediaId_key" ON "Media"("storageProvider", "externalMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "SatisfactionResponse_attendanceId_key" ON "SatisfactionResponse"("attendanceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProtocolSequence_protocolDate_key" ON "ProtocolSequence"("protocolDate");

-- AddForeignKey
ALTER TABLE "SacCase" ADD CONSTRAINT "SacCase_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SacCase" ADD CONSTRAINT "SacCase_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SacCase" ADD CONSTRAINT "SacCase_replacedByCaseId_fkey" FOREIGN KEY ("replacedByCaseId") REFERENCES "SacCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SacCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SatisfactionResponse" ADD CONSTRAINT "SatisfactionResponse_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
