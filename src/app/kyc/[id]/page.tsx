import { Prisma } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { submitDecision } from "@/app/kyc/actions";
import { ActorBar } from "@/app/ActorBar";
import { auditTrailFor } from "@/lib/audit";
import {
  getCase,
  isRejectionCategory,
  KYC_ENTITY,
  OPEN_STATUSES,
  REJECTION_CATEGORIES,
} from "@/lib/kyc";
import { can } from "@/lib/permissions";
import { getActor, listActors } from "@/lib/session";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});
const DATETIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const DONE_MESSAGE: Record<string, string> = {
  approve: "Case approved.",
  reject: "Case rejected.",
  escalate: "Case escalated.",
};

/** The rejection category recorded alongside a decision, if there was one. */
function entryCategory(metadata: Prisma.JsonValue): string | null {
  if (
    typeof metadata !== "object" ||
    metadata === null ||
    Array.isArray(metadata)
  ) {
    return null;
  }
  const value = metadata.rejectionCategory;
  return typeof value === "string" && isRejectionCategory(value)
    ? REJECTION_CATEGORIES[value]
    : null;
}

export default async function KycCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const { id } = await params;
  const { error, done } = await searchParams;

  const [actor, actors] = await Promise.all([getActor(), listActors()]);
  if (!actor) notFound();

  const [kycCase, trail] = await Promise.all([
    getCase(id, actor.role),
    auditTrailFor(KYC_ENTITY, id),
  ]);
  if (!kycCase) notFound();

  const isOpen = OPEN_STATUSES.includes(kycCase.status);
  const decisions = (
    [
      { value: "approve", label: "Approve", action: "kyc.approve" },
      { value: "reject", label: "Reject", action: "kyc.reject" },
      { value: "escalate", label: "Escalate", action: "kyc.escalate" },
    ] as const
  ).filter((decision) => can(actor.role, decision.action));

  return (
    <main className="page">
      <ActorBar actor={actor} actors={actors} />
      <p>
        <Link href="/kyc">← Back to queue</Link>
      </p>

      <h1>
        {kycCase.reference}{" "}
        <span className={`badge risk-${kycCase.riskFlag.toLowerCase()}`}>
          {kycCase.riskFlag} risk
        </span>{" "}
        <span className="badge">{kycCase.status}</span>
      </h1>

      {error && <p className="alert error">{error}</p>}
      {done && DONE_MESSAGE[done] && (
        <p className="alert ok">{DONE_MESSAGE[done]}</p>
      )}

      <h2>Applicant</h2>
      <dl>
        <dt>Name</dt>
        <dd>{kycCase.applicantName}</dd>
        <dt>Email</dt>
        <dd>{kycCase.applicantEmail}</dd>
        <dt>Date of birth</dt>
        <dd>{kycCase.dateOfBirth}</dd>
        <dt>National ID</dt>
        <dd>{kycCase.nationalId}</dd>
        <dt>Address</dt>
        <dd>{kycCase.address}</dd>
        <dt>Country</dt>
        <dd>{kycCase.country}</dd>
        <dt>Occupation</dt>
        <dd>{kycCase.occupation}</dd>
        <dt>Submitted</dt>
        <dd>{DATE.format(kycCase.submittedAt)}</dd>
        <dt>Risk notes</dt>
        <dd>{kycCase.riskNotes}</dd>
        {kycCase.rejectionCategory && (
          <>
            <dt>Rejection category</dt>
            <dd>{REJECTION_CATEGORIES[kycCase.rejectionCategory]}</dd>
          </>
        )}
        {kycCase.decidedAt && (
          <>
            <dt>Decided</dt>
            <dd>
              {DATETIME.format(kycCase.decidedAt)} by {kycCase.decidedBy}
            </dd>
          </>
        )}
      </dl>

      <h2>Decision</h2>
      {isOpen ? (
        <form action={submitDecision} className="decision">
          <input type="hidden" name="caseId" value={kycCase.id} />
          <label htmlFor="reason">Reason (recorded in the audit log)</label>
          <textarea id="reason" name="reason" rows={3} required />
          <label htmlFor="rejectionCategory">
            Rejection category (required to reject)
          </label>
          <select
            id="rejectionCategory"
            name="rejectionCategory"
            defaultValue=""
          >
            <option value="">Select a category…</option>
            {Object.entries(REJECTION_CATEGORIES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <div className="buttons">
            {decisions.map((decision) => (
              <button
                key={decision.value}
                type="submit"
                name="decision"
                value={decision.value}
              >
                {decision.label}
              </button>
            ))}
          </div>
          <p className="muted">
            {actor.role} may: {decisions.map((d) => d.label).join(", ")}.
          </p>
        </form>
      ) : (
        <p className="muted">This case is closed.</p>
      )}

      <h2>Audit trail</h2>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>Action</th>
            <th>Category</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {trail.map((entry) => (
            <tr key={entry.id}>
              <td>{DATETIME.format(entry.createdAt)}</td>
              <td>{entry.actor}</td>
              <td>{entry.action}</td>
              <td>{entryCategory(entry.metadata) ?? "—"}</td>
              <td>{entry.reason}</td>
            </tr>
          ))}
          {trail.length === 0 && (
            <tr>
              <td colSpan={5}>No actions recorded yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
