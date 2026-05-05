import type { ReactNode } from "react";

export const metadata = {
  title: "shh wallet",
  description: "Privacy wallet backend for the shh L3",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
