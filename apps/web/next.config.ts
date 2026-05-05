import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Heavy crypto deps run only in Node route handlers — keep them external (don't bundle
  // their wasm into the server build).
  serverExternalPackages: ["@shh/sdk", "circomlibjs", "snarkjs"],
};

export default nextConfig;
