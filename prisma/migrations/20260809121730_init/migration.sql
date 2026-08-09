-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('QA', 'QA_HEAD', 'USER_DEPT', 'USER_HEAD', 'FACTORY_MGR', 'PRESDIR', 'ADMIN');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('DRAFT', 'PENDING_QA_HEAD_REVIEW', 'REVISION_REQUESTED', 'PUBLISHED', 'IGNORED', 'CPAR_ISSUED', 'CPAR_IN_PROGRESS', 'CPAR_UNDER_VERIFICATION', 'CPAR_REVISION', 'CPAR_APPROVED', 'CAPA_MONITORING', 'VERIFIED_CLOSED');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('OFFICIAL', 'NON_OFFICIAL', 'INFORMATION_ONLY');

-- CreateEnum
CREATE TYPE "Shift" AS ENUM ('MORNING', 'NIGHT');

-- CreateEnum
CREATE TYPE "FailurePlaceType" AS ENUM ('REGULAR', 'DOMESTIC', 'EXPORT', 'SERVICE_PART');

-- CreateEnum
CREATE TYPE "OriginPlantType" AS ENUM ('NID', 'PASSTHROUGH', 'VENDOR_SUBCON');

-- CreateEnum
CREATE TYPE "OccurrenceCount" AS ENUM ('FIRST_TIME', 'SECOND_TIME', 'THIRD_OR_MORE');

-- CreateEnum
CREATE TYPE "PartSide" AS ENUM ('STANDARD', 'ACTUAL');

-- CreateEnum
CREATE TYPE "QtyUnit" AS ENUM ('PCS', 'BOX');

-- CreateEnum
CREATE TYPE "ResponsibilityType" AS ENUM ('CFT', 'USER_DEPT');

-- CreateEnum
CREATE TYPE "CparSectionKey" AS ENUM ('PROBLEM_DESCRIPTION', 'TEMPORARY_ACTION', 'ROOT_CAUSE_OCCURRENCE', 'ROOT_CAUSE_OUTFLOW', 'PERMANENT_COUNTERMEASURE', 'STANDARDIZATION_HORIZONTAL', 'EFFECTIVENESS_PLAN');

-- CreateEnum
CREATE TYPE "VerificationDecision" AS ENUM ('VERIFIED', 'REVISE');

-- CreateEnum
CREATE TYPE "MonitoringStatus" AS ENUM ('PENDING', 'EFFECTIVE', 'NOT_EFFECTIVE');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('BAD_NEWS', 'QUICK_INFO', 'CPAR', 'MONITORING', 'A3');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CLAIM_REVIEW_REQUEST', 'CLAIM_REVISION_REQUEST', 'NEW_CUSTOMER_CLAIM', 'CPAR_REQUEST', 'CLAIM_IGNORATION', 'CPAR_DAILY_REMINDER', 'CPAR_REVIEW_REQUEST', 'CPAR_REVIEW_REMINDER', 'CPAR_REVISION_REQUEST', 'CPAR_APPROVED', 'MONITORING_EVIDENCE_REQUEST', 'MONITORING_WEEKLY_REMINDER', 'CAPA_NOT_EFFECTIVE', 'MONITORING_FINISHED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "CounterScope" AS ENUM ('CLAIM', 'CPAR');

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "code" "RoleCode" NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "employeeNo" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "departmentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "NonConformanceDetail" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "NonConformanceDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InitialDocument" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "InitialDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL,
    "internalPartNo" TEXT NOT NULL,
    "customerPartNo" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipientGroup" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleCodes" "RoleCode"[],
    "extraEmails" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RecipientGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "subject" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "bodyIntro" TEXT NOT NULL,
    "ctaLabel" TEXT NOT NULL DEFAULT 'Open in portal',
    "recipientGroupId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "claimNo" TEXT,
    "status" "ClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "type" "ClaimType" NOT NULL,
    "dateOfOccurrence" TIMESTAMP(3) NOT NULL,
    "shiftOfOccurrence" "Shift" NOT NULL,
    "dateOfReceived" TIMESTAMP(3) NOT NULL,
    "shiftOfReceived" "Shift" NOT NULL,
    "failurePlace" TEXT NOT NULL,
    "failurePlaceType" "FailurePlaceType" NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "internalPartNo" TEXT NOT NULL,
    "customerPartNo" TEXT NOT NULL,
    "partName" TEXT NOT NULL,
    "productCategoryId" TEXT NOT NULL,
    "originPlantType" "OriginPlantType" NOT NULL,
    "originPlantDetail" TEXT,
    "occurrence" "OccurrenceCount" NOT NULL,
    "ncDetailId" TEXT NOT NULL,
    "customerId" TEXT,
    "abnormalSource" TEXT NOT NULL,
    "qualityProblem" TEXT NOT NULL,
    "lotNo" TEXT NOT NULL,
    "kanbanNo" TEXT NOT NULL,
    "injectionDate" TIMESTAMP(3),
    "assemblyDate" TIMESTAMP(3),
    "deliveryDate" TIMESTAMP(3),
    "suspectedProcessLine" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "publishedAt" TIMESTAMP(3),
    "ignorationReason" TEXT,
    "ignoredAt" TIMESTAMP(3),
    "ignoredById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimPart" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "side" "PartSide" NOT NULL,
    "photoCaption" TEXT,
    "partName" TEXT NOT NULL,
    "nidPartNo" TEXT NOT NULL,
    "qty" DECIMAL(12,2) NOT NULL,
    "qtyUnit" "QtyUnit" NOT NULL,
    "dimensionItem" TEXT,
    "appearanceItem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ClaimPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cpar" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "cparNo" TEXT NOT NULL,
    "responsibilityType" "ResponsibilityType" NOT NULL,
    "responsibleDeptId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Cpar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CparCftMember" (
    "cparId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,

    CONSTRAINT "CparCftMember_pkey" PRIMARY KEY ("cparId","departmentId")
);

-- CreateTable
CREATE TABLE "CparInitialDocument" (
    "cparId" TEXT NOT NULL,
    "initialDocumentId" TEXT NOT NULL,
    "fulfilledAt" TIMESTAMP(3),

    CONSTRAINT "CparInitialDocument_pkey" PRIMARY KEY ("cparId","initialDocumentId")
);

-- CreateTable
CREATE TABLE "CparSection" (
    "id" TEXT NOT NULL,
    "cparId" TEXT NOT NULL,
    "key" "CparSectionKey" NOT NULL,
    "content" TEXT,
    "data" JSONB,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "filledById" TEXT,
    "filledAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "revisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CparSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "cparId" TEXT NOT NULL,
    "role" "RoleCode" NOT NULL,
    "verifierId" TEXT NOT NULL,
    "decision" "VerificationDecision" NOT NULL,
    "comment" TEXT,
    "targetSections" "CparSectionKey"[],
    "cycle" INTEGER NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringPeriod" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "periodNo" INTEGER NOT NULL,
    "openedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "MonitoringStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "filledById" TEXT,
    "filledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MonitoringPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImprovementReport" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "summary" TEXT NOT NULL,
    "lessonLearned" TEXT,
    "a3Content" JSONB,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ImprovementReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "caption" TEXT,
    "claimId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedDocument" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "path" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "generatedById" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "GeneratedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "claimId" TEXT,
    "type" "NotificationType" NOT NULL,
    "recipients" TEXT[],
    "ccRecipients" TEXT[],
    "subject" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "payload" JSONB,
    "attachmentPaths" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "claimId" TEXT,
    "action" TEXT NOT NULL,
    "fromStatus" "ClaimStatus",
    "toStatus" "ClaimStatus",
    "payloadDiff" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "id" TEXT NOT NULL,
    "scope" "CounterScope" NOT NULL,
    "bucket" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE INDEX "Department_deletedAt_idx" ON "Department"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeNo_key" ON "User"("employeeNo");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "NonConformanceDetail_code_key" ON "NonConformanceDetail"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_code_key" ON "ProductCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InitialDocument_code_key" ON "InitialDocument"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Part_internalPartNo_key" ON "Part"("internalPartNo");

-- CreateIndex
CREATE INDEX "Part_customerPartNo_idx" ON "Part"("customerPartNo");

-- CreateIndex
CREATE UNIQUE INDEX "RecipientGroup_code_key" ON "RecipientGroup"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_type_key" ON "EmailTemplate"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_claimNo_key" ON "Claim"("claimNo");

-- CreateIndex
CREATE INDEX "Claim_status_idx" ON "Claim"("status");

-- CreateIndex
CREATE INDEX "Claim_type_idx" ON "Claim"("type");

-- CreateIndex
CREATE INDEX "Claim_createdById_idx" ON "Claim"("createdById");

-- CreateIndex
CREATE INDEX "Claim_dateOfOccurrence_idx" ON "Claim"("dateOfOccurrence");

-- CreateIndex
CREATE INDEX "Claim_internalPartNo_idx" ON "Claim"("internalPartNo");

-- CreateIndex
CREATE INDEX "Claim_deletedAt_idx" ON "Claim"("deletedAt");

-- CreateIndex
CREATE INDEX "ClaimPart_claimId_idx" ON "ClaimPart"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimPart_claimId_side_key" ON "ClaimPart"("claimId", "side");

-- CreateIndex
CREATE UNIQUE INDEX "Cpar_claimId_key" ON "Cpar"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "Cpar_cparNo_key" ON "Cpar"("cparNo");

-- CreateIndex
CREATE INDEX "Cpar_responsibleDeptId_idx" ON "Cpar"("responsibleDeptId");

-- CreateIndex
CREATE INDEX "Cpar_dueDate_idx" ON "Cpar"("dueDate");

-- CreateIndex
CREATE INDEX "CparCftMember_departmentId_idx" ON "CparCftMember"("departmentId");

-- CreateIndex
CREATE INDEX "CparInitialDocument_initialDocumentId_idx" ON "CparInitialDocument"("initialDocumentId");

-- CreateIndex
CREATE INDEX "CparSection_cparId_idx" ON "CparSection"("cparId");

-- CreateIndex
CREATE UNIQUE INDEX "CparSection_cparId_key_key" ON "CparSection"("cparId", "key");

-- CreateIndex
CREATE INDEX "Verification_cparId_cycle_idx" ON "Verification"("cparId", "cycle");

-- CreateIndex
CREATE INDEX "Verification_verifierId_idx" ON "Verification"("verifierId");

-- CreateIndex
CREATE UNIQUE INDEX "Verification_cparId_role_cycle_key" ON "Verification"("cparId", "role", "cycle");

-- CreateIndex
CREATE INDEX "MonitoringPeriod_claimId_status_idx" ON "MonitoringPeriod"("claimId", "status");

-- CreateIndex
CREATE INDEX "MonitoringPeriod_dueDate_idx" ON "MonitoringPeriod"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringPeriod_claimId_cycle_periodNo_key" ON "MonitoringPeriod"("claimId", "cycle", "periodNo");

-- CreateIndex
CREATE INDEX "ImprovementReport_claimId_idx" ON "ImprovementReport"("claimId");

-- CreateIndex
CREATE INDEX "ImprovementReport_submittedById_idx" ON "ImprovementReport"("submittedById");

-- CreateIndex
CREATE INDEX "Attachment_entityType_entityId_idx" ON "Attachment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Attachment_claimId_idx" ON "Attachment"("claimId");

-- CreateIndex
CREATE INDEX "Attachment_uploadedById_idx" ON "Attachment"("uploadedById");

-- CreateIndex
CREATE INDEX "GeneratedDocument_claimId_idx" ON "GeneratedDocument"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedDocument_claimId_kind_cycle_version_key" ON "GeneratedDocument"("claimId", "kind", "cycle", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_claimId_idx" ON "Notification"("claimId");

-- CreateIndex
CREATE INDEX "Notification_status_idx" ON "Notification"("status");

-- CreateIndex
CREATE INDEX "Notification_type_createdAt_idx" ON "Notification"("type", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_claimId_createdAt_idx" ON "AuditLog"("claimId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "Counter_scope_bucket_key" ON "Counter"("scope", "bucket");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_productCategoryId_fkey" FOREIGN KEY ("productCategoryId") REFERENCES "ProductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_ncDetailId_fkey" FOREIGN KEY ("ncDetailId") REFERENCES "NonConformanceDetail"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_ignoredById_fkey" FOREIGN KEY ("ignoredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimPart" ADD CONSTRAINT "ClaimPart_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cpar" ADD CONSTRAINT "Cpar_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cpar" ADD CONSTRAINT "Cpar_responsibleDeptId_fkey" FOREIGN KEY ("responsibleDeptId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CparCftMember" ADD CONSTRAINT "CparCftMember_cparId_fkey" FOREIGN KEY ("cparId") REFERENCES "Cpar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CparCftMember" ADD CONSTRAINT "CparCftMember_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CparInitialDocument" ADD CONSTRAINT "CparInitialDocument_cparId_fkey" FOREIGN KEY ("cparId") REFERENCES "Cpar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CparInitialDocument" ADD CONSTRAINT "CparInitialDocument_initialDocumentId_fkey" FOREIGN KEY ("initialDocumentId") REFERENCES "InitialDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CparSection" ADD CONSTRAINT "CparSection_cparId_fkey" FOREIGN KEY ("cparId") REFERENCES "Cpar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CparSection" ADD CONSTRAINT "CparSection_filledById_fkey" FOREIGN KEY ("filledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_cparId_fkey" FOREIGN KEY ("cparId") REFERENCES "Cpar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_verifierId_fkey" FOREIGN KEY ("verifierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringPeriod" ADD CONSTRAINT "MonitoringPeriod_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringPeriod" ADD CONSTRAINT "MonitoringPeriod_filledById_fkey" FOREIGN KEY ("filledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprovementReport" ADD CONSTRAINT "ImprovementReport_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprovementReport" ADD CONSTRAINT "ImprovementReport_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
