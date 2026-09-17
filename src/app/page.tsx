export default function Home() {
  return (
    <main style={{ padding: "3rem", maxWidth: "48rem", lineHeight: 1.6 }}>
      <h1>Internal ops tools</h1>
      <p>
        Shared foundation only — no feature app is mounted yet. State changes go
        through the <code>mutate()</code> helper in <code>src/lib/mutate.ts</code>,
        which checks the actor&apos;s role, applies the change and appends the audit
        entry in one transaction.
      </p>
    </main>
  );
}
