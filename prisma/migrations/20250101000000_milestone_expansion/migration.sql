-- Enums for collaboration workflows and feature lifecycle
CREATE TYPE "FeatureStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'APPLIED', 'REJECTED');
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');
CREATE TYPE "ProjectRole" AS ENUM ('OWNER', 'EDITOR', 'REVIEWER');
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "ADRStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- Feature backlog and preview snapshots
CREATE TABLE "Feature" (
    "id" TEXT PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "FeatureStatus" NOT NULL DEFAULT 'DRAFT',
    "changeRequest" JSONB NOT NULL,
    "preview" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Invitations and collaborator roster
CREATE TABLE "ProjectInvite" (
    "id" TEXT PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "invitedBy" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3)
);

CREATE UNIQUE INDEX "ProjectInvite_token_key" ON "ProjectInvite"("token");

CREATE TABLE "ProjectCollaborator" (
    "id" TEXT PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ProjectCollaborator_projectId_userId_key" ON "ProjectCollaborator"("projectId", "userId");

-- Review queues for feature changes
CREATE TABLE "ProjectReview" (
    "id" TEXT PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Project-level locks to coordinate edits
CREATE TABLE "ProjectLock" (
    "id" TEXT PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "lockedBy" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "ProjectLock_projectId_key" ON "ProjectLock"("projectId");

-- Architecture decision records
CREATE TABLE "ADR" (
    "id" TEXT PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "consequences" TEXT NOT NULL,
    "status" "ADRStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Foreign keys connecting new collaboration tables
ALTER TABLE "Feature"
  ADD CONSTRAINT "Feature_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectInvite"
  ADD CONSTRAINT "ProjectInvite_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectCollaborator"
  ADD CONSTRAINT "ProjectCollaborator_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectCollaborator"
  ADD CONSTRAINT "ProjectCollaborator_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectReview"
  ADD CONSTRAINT "ProjectReview_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectReview"
  ADD CONSTRAINT "ProjectReview_featureId_fkey"
  FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectReview"
  ADD CONSTRAINT "ProjectReview_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectLock"
  ADD CONSTRAINT "ProjectLock_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ADR"
  ADD CONSTRAINT "ADR_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

