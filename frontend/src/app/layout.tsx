import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { cookies } from "next/headers";

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

// Clave de la preferencia de tema (cookie + localStorage). Debe coincidir con THEME_STORAGE_KEY
// del ThemeToggle. La cookie permite fijar el tema en el SERVIDOR (sin parpadeo y SIN un <script>
// inline en el árbol, que React 19 rechaza con "Encountered a script tag...").
const THEME_COOKIE = "mp-theme";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // No-flash SIN script cliente: el tema persistido viaja en la cookie ``mp-theme`` y se aplica en
  // ``data-theme`` del <html> durante el render del servidor. El ThemeToggle escribe la cookie al
  // alternar; así el primer paint ya sale en el tema correcto.
  const stored = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = stored === "dark" ? "dark" : "light";

  return (
    <html lang="es" data-theme={theme} className={geist.variable}>
      <body>{children}</body>
    </html>
  );
}
