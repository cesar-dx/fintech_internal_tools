-- CreateEnum
CREATE TYPE "KycRejectionCategory" AS ENUM ('DOCUMENT_QUALITY', 'SANCTIONS_MATCH', 'DUPLICATE_APPLICANT', 'OTHER');

-- AlterTable
ALTER TABLE "KycCase" ADD COLUMN     "rejectionCategory" "KycRejectionCategory";
