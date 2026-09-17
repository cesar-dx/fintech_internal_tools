import Link from "next/link";
import { ActorBar } from "@/app/ActorBar";
import { listOpenCases } from "@/lib/kyc";
import { getActor, listActors } from "@/lib/session";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export default async function KycQueuePage() {
  const [actor, actors, cases] = await Promise.all([
    getActor(),
    listActors(),
    listOpenCases(),
  ]);

  if (!actor) {
    return (
      <main className="page">
        <h1>KYC review queue</h1>
        <p>No users found. Run `npm run db:seed` first.</p>
      </main>
    );
  }

  return (
    <main className="page">
      <ActorBar actor={actor} actors={actors} />
      <h1>KYC review queue</h1>
      <p className="muted">{cases.length} case(s) awaiting a decision.</p>

      <table>
        <thead>
          <tr>
            <th>Reference</th>
            <th>Applicant</th>
            <th>Submitted</th>
            <th>Risk</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((kycCase) => (
            <tr key={kycCase.id}>
              <td>
                <Link href={`/kyc/${kycCase.id}`}>{kycCase.reference}</Link>
              </td>
              <td>{kycCase.applicantName}</td>
              <td>{DATE.format(kycCase.submittedAt)}</td>
              <td>
                <span className={`badge risk-${kycCase.riskFlag.toLowerCase()}`}>
                  {kycCase.riskFlag}
                </span>
              </td>
              <td>
                <span className="badge">{kycCase.status}</span>
              </td>
            </tr>
          ))}
          {cases.length === 0 && (
            <tr>
              <td colSpan={5}>Queue is empty.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
