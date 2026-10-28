-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "walletAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturerApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "businessEmail" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "authorizationTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "unitSerial" TEXT NOT NULL,
    "manufactureDate" TEXT,
    "expiryDate" TEXT,
    "manufacturerUserId" TEXT NOT NULL,
    "manufacturerWallet" TEXT NOT NULL,
    "referenceImageCID" TEXT NOT NULL,
    "metadataCID" TEXT,
    "metadataHash" TEXT,
    "chainId" TEXT,
    "contractAddress" TEXT,
    "txHash" TEXT,
    "qrFilename" TEXT,
    "qrUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationSession" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "gate1Status" TEXT NOT NULL DEFAULT 'NOT_CHECKED',
    "gate2Status" TEXT NOT NULL DEFAULT 'NOT_CHECKED',
    "gate3Status" TEXT NOT NULL DEFAULT 'NOT_CHECKED',
    "overallStatus" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "reasonCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "modelVersion" TEXT,

    CONSTRAINT "VerificationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanEvent" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "serverReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracyMeters" DOUBLE PRECISION,
    "locationConsent" BOOLEAN NOT NULL DEFAULT false,
    "previousScanId" TEXT,
    "distanceKm" DOUBLE PRECISION,
    "elapsedSeconds" INTEGER,
    "estimatedSpeedKmh" DOUBLE PRECISION,
    "caspgStatus" TEXT NOT NULL,
    "reasonCode" TEXT,
    "evidenceHash" TEXT,
    "chainAuditTxHash" TEXT,

    CONSTRAINT "ScanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageComparison" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "referenceCID" TEXT NOT NULL,
    "modelVersion" TEXT,
    "threshold" DOUBLE PRECISION,
    "distanceScore" DOUBLE PRECISION,
    "qualityStatus" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageComparison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "status" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "ManufacturerApplication_userId_idx" ON "ManufacturerApplication"("userId");

-- CreateIndex
CREATE INDEX "ManufacturerApplication_status_idx" ON "ManufacturerApplication"("status");

-- CreateIndex
CREATE INDEX "ManufacturerApplication_walletAddress_idx" ON "ManufacturerApplication"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Product_productId_key" ON "Product"("productId");

-- CreateIndex
CREATE INDEX "Product_manufacturerUserId_idx" ON "Product"("manufacturerUserId");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Product_manufacturerUserId_batchNumber_unitSerial_key" ON "Product"("manufacturerUserId", "batchNumber", "unitSerial");

-- CreateIndex
CREATE INDEX "VerificationSession_productId_startedAt_idx" ON "VerificationSession"("productId", "startedAt");

-- CreateIndex
CREATE INDEX "VerificationSession_userId_startedAt_idx" ON "VerificationSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "ScanEvent_productId_serverReceivedAt_idx" ON "ScanEvent"("productId", "serverReceivedAt");

-- CreateIndex
CREATE INDEX "ScanEvent_sessionId_idx" ON "ScanEvent"("sessionId");

-- CreateIndex
CREATE INDEX "ImageComparison_sessionId_idx" ON "ImageComparison"("sessionId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

