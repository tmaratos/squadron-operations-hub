import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Squadron Operations Hub",
  description: "Operational backend for squadron administration"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
