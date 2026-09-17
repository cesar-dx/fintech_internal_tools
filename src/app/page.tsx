import Link from "next/link";

export default function Home() {
  return (
    <main className="page">
      <h1>Internal ops tools</h1>
      <ul className="tools">
        <li>
          <Link href="/kyc">KYC review queue</Link> — review and decide
          applicant files.
        </li>
        <li>
          <Link href="/refunds">Refunds</Link> — search transactions and issue
          refunds.
        </li>
      </ul>
    </main>
  );
}
