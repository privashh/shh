# shh — Threat Model

What shh protects, what it does not, and how each threat is mitigated. Read alongside
[privacy-design.md](./privacy-design.md).

## Assets & goals

- **Unlinkability** between a deposit and its withdrawal (Privacy Pool) / between note owners
  and transfers (Shielded Pool).
- **Fund integrity**: no inflation, no theft, no double spend.
- **Compliance optionality**: the ASP can scope which deposits exit privately, without
  learning more than the public deposit set.

## Trust assumptions

- Groth16 soundness + a non-backdoored trusted setup (dev = single contributor; prod = MPC).
- Poseidon and the BN254 curve are secure; the on-chain hasher equals the circuit's Poseidon
  (enforced: `MerkleTreeWithHistory` uses the circomlibjs-generated hasher; SDK uses
  poseidon-lite, verified byte-equal).
- The OP Stack settlement layer (Base) and its bridge/portal behave per spec.

## Threats & mitigations

| Threat                                 | Mitigation                                                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Double spend                           | Per-spend `nullifierHash` recorded on-chain; reuse reverts. Tested.                                                                                              |
| Forged membership                      | Withdrawals verify a Groth16 proof of Merkle inclusion against a known root; `isKnownRoot` accepts only current/recent roots (ring buffer).                      |
| Value inflation (Shielded)             | Circuit enforces `Σ in + publicAmount = Σ out` (mod p); outputs range-checked to 248 bits. Tested.                                                               |
| Withdrawal front-running / proof theft | Circuit binds `recipient, relayer, fee, refund` (PrivacyPool) and `extDataHash` (ShieldedPool); a stolen proof can't be re-aimed. Tested.                        |
| Non-compliant exit                     | PrivacyPool requires membership in an ASP-published association root; excluded deposits are non-withdrawable through the private path ("unlockable"). Tested.    |
| Bridge spoofing (deposit)              | `L2ShieldedBridge.finalizeShieldedDeposit` accepts only the aliased L1 bridge address (OP deposit aliasing). Tested.                                             |
| Bridge spoofing (withdraw)             | `bridgeWithdraw` spends via a proof bound to the bridge as recipient, then uses the canonical L2StandardBridge for the authenticated L2→L1 ETH transfer. Tested. |
| Trusted-setup backdoor                 | MPC ceremony for production (Phase 8); dev keys are clearly marked non-production.                                                                               |
| Reentrancy on payout                   | Effects-before-interactions: nullifier marked spent before transfers; payouts via checked `call`.                                                                |
| Relayer censorship / fee griefing      | Relayer is untrusted for safety (proof binds recipient/fee); it can only refuse service, not steal. Users can self-submit.                                       |
| Anonymity-set erosion                  | Larger sets = stronger privacy; fixed denominations and shared trees concentrate the set. UX should discourage amount/timing fingerprints (frontend concern).    |
| Weak randomness for secrets            | SDK uses Web Crypto (`getRandomValues`) reduced into the field.                                                                                                  |

## Known limitations

- Single-contributor dev trusted setup (see [SECURITY.md](../SECURITY.md)).
- No audit yet; fuzz/invariant tests are still to be added.
- Encrypted-note discovery (ECIES ciphertexts) is stubbed (`0x`) until the frontend lands.
- Metadata privacy (IP, timing) is out of scope at the protocol layer; relayers + client
  behavior must address it.
