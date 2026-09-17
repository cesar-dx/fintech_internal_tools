import Link from "next/link";
import { ActorBar } from "@/app/ActorBar";
import { submitRefundDecision } from "@/app/refunds/actions";
import { can } from "@/lib/permissions";
import {
  APPROVAL_THRESHOLD_CENTS,
  formatAmount,
  listRefundsAwaitingApproval,
} from "@/lib/refunds";
import { getActor, listActors } from "@/lib/session";

export const dynamic = "force-dynamic";

const DATETIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const DONE_MESSAGE: Record<string, string> = {
  approve: "Refund approved and issued.",
  reject: "Refund rejected.",
};

export default async function RefundApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const { error, done } = await searchParams;

  const [actor, actors] = await Promise.all([getActor(), listActors()]);
  if (!actor) {
    return (
      <main className="page">
        <h1>Refund approvals</h1>
        <p>No users found. Run `npm run db:seed` first.</p>
      </main>
    );
  }

  const pending = await listRefundsAwaitingApproval();
  const canReview = can(actor.role, "refund.approve");

  return (
    <main className="page">
      <ActorBar actor={actor} actors={actors} />
      <p>
        <Link href="/refunds">← Back to search</Link>
      </p>

      <h1>Refund approvals</h1>
      <p className="muted">
        Refunds over {formatAmount(APPROVAL_THRESHOLD_CENTS, "USD")} wait here
        for a reviewer. {pending.length} awaiting a decision.
      </p>

      {error && <p className="alert error">{error}</p>}
      {done && DONE_MESSAGE[done] && (
        <p className="alert ok">{DONE_MESSAGE[done]}</p>
      )}

      {pending.length === 0 && <p className="muted">Nothing to review.</p>}

      {pending.map((refund) => {
        const isOwnRequest = refund.requestedById === actor.id;

        return (
          <section key={refund.id} className="approval">
            <h2>
              <Link href={`/refunds/${refund.transactionId}`}>
                {refund.transactionReference}
              </Link>{" "}
              — {formatAmount(refund.amountCents, refund.currency)}
            </h2>
            <dl>
              <dt>Customer</dt>
              <dd>{refund.customerName}</dd>
              <dt>Requested</dt>
              <dd>
                {DATETIME.format(refund.requestedAt)} by {refund.requestedBy}
              </dd>
              <dt>Reason given</dt>
              <dd>{refund.reason}</dd>
            </dl>

            {canReview && !isOwnRequest ? (
              <form action={submitRefundDecision} className="decision">
                <input type="hidden" name="refundId" value={refund.id} />
                <label htmlFor={`reason-${refund.id}`}>
                  Decision reason (recorded in the audit log)
                </label>
                <textarea
                  id={`reason-${refund.id}`}
                  name="reason"
                  rows={2}
                  required
                />
                <div className="buttons">
                  <button type="submit" name="decision" value="approve">
                    Approve
                  </button>
                  <button type="submit" name="decision" value="reject">
                    Reject
                  </button>
                </div>
              </form>
            ) : (
              <p className="muted">
                {isOwnRequest
                  ? "You requested this refund, so another reviewer must decide it."
                  : `${actor.role} cannot approve refunds.`}
              </p>
            )}
          </section>
        );
      })}
    </main>
  );
}
