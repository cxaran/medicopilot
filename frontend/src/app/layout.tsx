import type { Metadata } from "next";
import { Geist } from "next/font/google";

import "./globals.css";

// Fuente del diseno (R1) cableada via next/font/google: expone la CSS var --font-geist
// que consume body en globals.css. Sin dependencia npm nueva.
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MedicoPilot",
  description: "Shell base reutilizable para productos MedicoPilot",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" data-theme="light" className={geist.variable}>
      <body>{children}</body>
    </html>
  );
}
