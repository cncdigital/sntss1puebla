import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./legal.css";
import "./events.css";
import "./scholarships.css";
import "./noticias.css";
import "./convenios.css";
import "./devi.css";
import "./devi-fact-bubble.css";
import "./devi-trainer.css";
import "./devi-progress-coach.css";
import "./notification-center.css";
import "./access-registration.css";
import "./facility-calendar.css";
import "./union-learning-game.css";
import "./official-home.css";
import "./private-chat.css";
export const metadata: Metadata = {
  metadataBase: new URL(
    "https://sntss1puebla.com",
  ),
  alternates: { canonical: "/" },
  title: "SNTSS Sección I Puebla | Sitio oficial",
  description:
    "Sitio oficial del Sindicato Nacional de Trabajadores del Seguro Social, Sección I Puebla: noticias, convenios, Credenciales y DeVi.",
  openGraph: {
    url: "/",
    title: "SNTSS Sección I Puebla | Sitio oficial",
    description: "Información, servicios y atención sindical para las trabajadoras y los trabajadores del IMSS en Puebla.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "SNTSS Sección I Puebla | Sitio oficial",
    description: "Información, servicios y atención sindical para las trabajadoras y los trabajadores del IMSS en Puebla.",
    images: ["/og.png"],
  },
  manifest: "/manifest.webmanifest",
  applicationName: "SNTSS1PUEBLA",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SNTSS1PUEBLA",
  },
  icons: {
    icon: [
      { url: "/favicon-64.png", sizes: "64x64", type: "image/png" },
      { url: "/app-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon-64.png",
    apple: "/app-icon-180.png",
  },
};
export const viewport: Viewport = {
  themeColor: "#071d36",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
