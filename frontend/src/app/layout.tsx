import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "MedicoPilot",
  description: "Shell base reutilizable para productos MedicoPilot",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
