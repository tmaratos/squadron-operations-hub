import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./dashboard-overrides.css";

export const metadata: Metadata = {
  title: {
    default: "Squadron Operations Hub",
    template: "%s | Squadron Operations Hub"
  },
  description: "Administrative and operational management for a Civil Air Patrol squadron"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
