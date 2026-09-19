-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "stripeRefundId" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "stripeChargeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Refund_stripeRefundId_key" ON "Refund"("stripeRefundId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_stripeChargeId_key" ON "Transaction"("stripeChargeId");

