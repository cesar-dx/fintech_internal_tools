import Link from "next/link";
import { notFound } from "next/navigation";
import { ActorBar } from "@/app/ActorBar";
import { submitRefund } from "@/app/refunds/actions";
import { auditTrailForMany } from "@/lib/audit";
import {
  APPROVAL_THRESHOLD_CENTS,
  formatAmount,
  getTransaction,
  REFUND_ENTITY,
} from "@/lib/refunds";
import { getActor, listActors } from "@/lib/session";

export const dynamic = "force-dynamic";

const DATETIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const DONE_MESSAGE: Record<string, string> = {
  issued: "Refund issued.",
  requested: "Refund sent for reviewer approval.",
};

export default async function TransactionPage({
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

  const transaction = await getTransaction(id, actor.role);
  if (!transaction) notFound();

  const trail = await auditTrailForMany(
    REFUND_ENTITY,
    transaction.refunds.map((refund) => refund.id),
  );
  const threshold = formatAmount(
    APPROVAL_THRESHOLD_CENTS,
    transaction.currency,
  );

  return (
    <main className="page">
      <ActorBar actor={actor} actors={actors} />
      <p>
        <Link href="/refunds">← Back to search</Link>
      </p>

      <h1>
        {transaction.reference}{" "}
        <span className="badge">{transaction.status}</span>
      </h1>

      {error && <p className="alert error">{error}</p>}
      {done && DONE_MESSAGE[done] && (
        <p className="alert ok">{DONE_MESSAGE[done]}</p>
      )}

      <h2>Transaction</h2>
      <dl>
        <dt>Customer</dt>
        <dd>{transaction.customerName}</dd>
        <dt>Email</dt>
        <dd>{transaction.customerEmail}</dd>
        <dt>Card</dt>
        <dd>•••• {transaction.cardLast4}</dd>
        <dt>Merchant</dt>
        <dd>{transaction.merchant}</dd>
        <dt>Description</dt>
        <dd>{transaction.description}</dd>
        <dt>Paid</dt>
        <dd>{DATETIME.format(transaction.occurredAt)}</dd>
        <dt>Amount</dt>
        <dd>{formatAmount(transaction.amountCents, transaction.currency)}</dd>
        <dt>Refunded</dt>
        <dd>{formatAmount(transaction.refundedCents, transaction.currency)}</dd>
        <dt>Still refundable</dt>
        <dd>
          {formatAmount(transaction.refundableCents, transaction.currency)}
        </dd>
      </dl>

      <h2>Issue a refund</h2>
      {transaction.refundableCents > 0 ? (
        <form action={submitRefund} className="decision">
          <input type="hidden" name="transactionId" value={transaction.id} />
          <label htmlFor="amount">Amount ({transaction.currency})</label>
          <input id="amount" name="amount" inputMode="decimal" required />
          <label htmlFor="reason">Reason (recorded in the audit log)</label>
          <textarea id="reason" name="reason" rows={3} required />
          <div className="buttons">
            <button type="submit">Submit refund</button>
          </div>
          <p className="muted">
            Refunds over {threshold} are held for a reviewer instead of being
            issued; the reviewer must be someone other than the requester.
          </p>
        </form>
      ) : (
        <p className="muted">
          Nothing left to refund on this transaction (pending refunds are
          reserved against the balance).
        </p>
      )}

      <h2>Refunds</h2>
      <table>
        <thead>
          <tr>
            <th>Requested</th>
            <th>Amount</th>
            <th>Requested by</th>
            <th>Reason</th>
            <th>Status</th>
            <th>Reviewed by</th>
          </tr>
        </thead>
        <tbody>
          {transaction.refunds.map((refund) => (
            <tr key={refund.id}>
              <td>{DATETIME.format(refund.requestedAt)}</td>
              <td>{formatAmount(refund.amountCents, refund.currency)}</td>
              <td>{refund.requestedBy}</td>
              <td>{refund.reason}</td>
              <td>
                <span className="badge">{refund.status}</span>
              </td>
              <td>{refund.reviewedBy ?? "—"}</td>
            </tr>
          ))}
          {transaction.refunds.length === 0 && (
            <tr>
              <td colSpan={6}>No refunds on this transaction.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Audit trail</h2>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>Action</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {trail.map((entry) => (
            <tr key={entry.id}>
              <td>{DATETIME.format(entry.createdAt)}</td>
              <td>{entry.actor}</td>
              <td>{entry.action}</td>
              <td>{entry.reason}</td>
            </tr>
          ))}
          {trail.length === 0 && (
            <tr>
              <td colSpan={4}>No actions recorded yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
