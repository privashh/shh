// Minimal ABIs — only the functions/events the backend touches.
export const PRIVACY_POOL_ABI = [
  "event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)",
  "function denomination() view returns (uint256)",
  "function nullifierHashes(bytes32) view returns (bool)",
  "function withdraw(uint256[2] a, uint256[2][2] b, uint256[2] c, bytes32 stateRoot, bytes32 associationRoot, bytes32 nullifierHash, address recipient, address relayer, uint256 fee, uint256 refund) payable",
];

export const SHIELDED_POOL_ABI = [
  "event NewCommitment(bytes32 indexed commitment, uint32 leafIndex, bytes encryptedOutput)",
  "event NewNullifier(bytes32 indexed nullifier)",
];

export const ASP_ABI = [
  "function currentRoot() view returns (uint256)",
  "event RootPublished(uint256 indexed root, string dataURI)",
];
