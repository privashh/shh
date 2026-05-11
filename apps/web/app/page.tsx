// Placeholder. The wallet frontend is intentionally deferred; only the backend is wired.
export default function Home() {
  return (
    <main style={{ fontFamily: "ui-monospace, monospace", padding: 32, lineHeight: 1.6 }}>
      <h1>shh wallet</h1>
      <p>Backend is live. The frontend is intentionally deferred.</p>
      <h2>API</h2>
      <ul>
        <li>
          <code>GET /api/health</code> — liveness
        </li>
        <li>
          <code>GET /api/config</code> — chain, addresses, circuit artifact URLs, relayer
        </li>
        <li>
          <code>GET /api/pool/leaves</code> — Privacy Pool commitments (rebuild the state tree)
        </li>
        <li>
          <code>GET /api/association/&lt;commitment&gt;</code> — association-set inclusion path
        </li>
        <li>
          <code>GET /api/shielded/events</code> — Shielded Pool commitments + nullifiers
        </li>
        <li>
          <code>POST /api/relayer/withdraw</code> — submit a gasless Privacy Pool withdrawal
        </li>
      </ul>
    </main>
  );
}
