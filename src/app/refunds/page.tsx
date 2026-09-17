import Link from "next/link";
import { ActorBar } from "@/app/ActorBar";
import {
  formatAmount,
  listRefundsAwaitingApproval,
  searchTransactions,
} from "@/lib/refunds";
import { getActor, listActors } from "@/lib/session";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export default async function RefundsSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q ?? "";

  const [actor, actors] = await Promise.all([getActor(), listActors()]);
  if (!actor) {
    return (
      <main className="page">
        <h1>Refunds</h1>
        <p>No users found. Run `npm run db:seed` first.</p>
      </main>
    );
  }

  const [results, pending] = await Promise.all([
    searchTransactions(query, actor.role),
    listRefundsAwaitingApproval(),
  ]);

  return (
    <main className="page">
      <ActorBar actor={actor} actors={actors} />
      <h1>Refunds</h1>
      <p className="muted">
        Search a transaction to issue a refund.{" "}
        <Link href="/refunds/approvals">
          {pending.length} refund(s) awaiting approval
        </Link>
        .
      </p>

      <form className="search" method="get">
        <label htmlFor="q">Reference, customer name, email or card last 4</label>
        <span className="search-row">
          <input id="q" name="q" defaultValue={query} placeholder="TXN-2041" />
          <button type="submit">Search</button>
        </span>
      </form>

      {query.trim().length > 0 && (
        <>
          <h2>Results</h2>
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Refunded</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map((transaction) => (
                <tr key={transaction.id}>
                  <td>
                    <Link href={`/refunds/${transaction.id}`}>
                      {transaction.reference}
                    </Link>
                  </td>
                  <td>
                    {transaction.customerName}
                    <br />
                    <span className="muted">{transaction.customerEmail}</span>
                  </td>
                  <td>{DATE.format(transaction.occurredAt)}</td>
                  <td>
                    {formatAmount(
                      transaction.amountCents,
                      transaction.currency,
                    )}
                  </td>
                  <td>
                    {transaction.refundedCents > 0
                      ? formatAmount(
                          transaction.refundedCents,
                          transaction.currency,
                        )
                      : "—"}
                  </td>
                  <td>
                    <span className="badge">{transaction.status}</span>
                  </td>
                </tr>
              ))}
              {results.length === 0 && (
                <tr>
                  <td colSpan={6}>No transactions match “{query}”.</td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
