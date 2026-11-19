import type { Metadata } from "next";
import "./globals.css";

const APP_TITLE = "DarkForge Channel OS";
const APP_DESCRIPTION =
  "Estação local de inteligência editorial e gestão multi-canal para YouTube com arquitetura hexagonal, RLS ponta a ponta e estúdio 2.5D de agentes.";

export const metadata: Metadata = {
  title: APP_TITLE,
  description: APP_DESCRIPTION,
  openGraph: {
    title: APP_TITLE,
    description: APP_DESCRIPTION,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: APP_TITLE,
    description: APP_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
