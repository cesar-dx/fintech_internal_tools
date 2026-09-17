import {
  KycRejectionCategory,
  KycStatus,
  RiskFlag,
  Role,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { mutate } from "@/lib/mutate";
import { AuditAction } from "@/lib/permissions";
import {
  redactAddress,
  redactDateOfBirth,
  redactEmail,
  redactIdNumber,
} from "@/lib/redact";

export const KYC_ENTITY = "KycCase";

/** Cases still needing a decision, in the order they were submitted. */
export const OPEN_STATUSES: KycStatus[] = ["PENDING", "ESCALATED"];

export type KycQueueItem = {
  id: string;
  reference: string;
  applicantName: string;
  submittedAt: Date;
  riskFlag: RiskFlag;
  status: KycStatus;
};

/** Rejection categories, in the order they are offered to a reviewer. */
export const REJECTION_CATEGORIES: Record<KycRejectionCategory, string> = {
  DOCUMENT_QUALITY: "Document quality",
  SANCTIONS_MATCH: "Sanctions match",
  DUPLICATE_APPLICANT: "Duplicate applicant",
  OTHER: "Other",
};

export function isRejectionCategory(
  value: string,
): value is KycRejectionCategory {
  return value in REJECTION_CATEGORIES;
}

export type KycCaseDetail = KycQueueItem & {
  applicantEmail: string;
  dateOfBirth: string;
  nationalId: string;
  country: string;
  address: string;
  occupation: string;
  riskNotes: string;
  rejectionCategory: KycRejectionCategory | null;
  decidedAt: Date | null;
  decidedBy: string | null;
};

export async function listOpenCases(): Promise<KycQueueItem[]> {
  const cases = await prisma.kycCase.findMany({
    where: { status: { in: OPEN_STATUSES } },
    orderBy: { submittedAt: "asc" },
  });

  return cases.map((kycCase) => ({
    id: kycCase.id,
    reference: kycCase.reference,
    applicantName: kycCase.applicantName,
    submittedAt: kycCase.submittedAt,
    riskFlag: kycCase.riskFlag,
    status: kycCase.status,
  }));
}

/**
 * Reads one case for a viewer. Identity fields are redacted here, at the
 * fetch, so a caller cannot obtain PII the viewer's role does not allow.
 */
export async function getCase(
  id: string,
  viewerRole: Role,
): Promise<KycCaseDetail | null> {
  const kycCase = await prisma.kycCase.findUnique({
    where: { id },
    include: { decidedBy: true },
  });
  if (!kycCase) return null;

  return {
    id: kycCase.id,
    reference: kycCase.reference,
    applicantName: kycCase.applicantName,
    submittedAt: kycCase.submittedAt,
    riskFlag: kycCase.riskFlag,
    status: kycCase.status,
    applicantEmail: redactEmail(kycCase.applicantEmail, viewerRole),
    dateOfBirth: redactDateOfBirth(kycCase.dateOfBirth, viewerRole),
    nationalId: redactIdNumber(kycCase.nationalId, viewerRole),
    country: kycCase.country,
    address: redactAddress(kycCase.address, viewerRole),
    occupation: kycCase.occupation,
    riskNotes: kycCase.riskNotes,
    rejectionCategory: kycCase.rejectionCategory,
    decidedAt: kycCase.decidedAt,
    decidedBy: kycCase.decidedBy?.name ?? null,
  };
}

export class CaseClosedError extends Error {}
export class RejectionCategoryRequiredError extends Error {}

const DECISIONS = {
  approve: { action: "kyc.approve", status: "APPROVED" },
  reject: { action: "kyc.reject", status: "REJECTED" },
  escalate: { action: "kyc.escalate", status: "ESCALATED" },
} as const satisfies Record<string, { action: AuditAction; status: KycStatus }>;

export type KycDecision = keyof typeof DECISIONS;

export function isKycDecision(value: string): value is KycDecision {
  return value in DECISIONS;
}

/**
 * Moves a case to its next status. Permission, the write and the audit entry
 * are handled by `mutate()` in a single transaction.
 */
export async function decideCase(params: {
  actorId: string;
  caseId: string;
  decision: KycDecision;
  reason: string;
  rejectionCategory?: KycRejectionCategory | null;
}) {
  const { action, status } = DECISIONS[params.decision];
  const isFinal = status === "APPROVED" || status === "REJECTED";

  const rejectionCategory =
    params.decision === "reject" ? (params.rejectionCategory ?? null) : null;
  if (params.decision === "reject" && rejectionCategory === null) {
    throw new RejectionCategoryRequiredError(
      "Select a rejection category to reject a case",
    );
  }

  return mutate({
    actorId: params.actorId,
    action,
    entityType: KYC_ENTITY,
    entityId: params.caseId,
    reason: params.reason,
    metadata: rejectionCategory ? { status, rejectionCategory } : { status },
    apply: async (tx) => {
      const current = await tx.kycCase.findUnique({
        where: { id: params.caseId },
      });
      if (!current) {
        throw new CaseClosedError(`Case ${params.caseId} not found`);
      }
      if (!OPEN_STATUSES.includes(current.status)) {
        throw new CaseClosedError(
          `Case ${current.reference} is already ${current.status.toLowerCase()}`,
        );
      }
      if (params.decision === "escalate" && current.status === "ESCALATED") {
        throw new CaseClosedError(
          `Case ${current.reference} is already escalated`,
        );
      }

      return tx.kycCase.update({
        where: { id: params.caseId },
        data: {
          status,
          rejectionCategory,
          decidedAt: isFinal ? new Date() : null,
          decidedById: isFinal ? params.actorId : null,
        },
      });
    },
  });
}
