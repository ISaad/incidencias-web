import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Incidencias",
  description: "Visor de incidencias de posventa (solo lectura)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
