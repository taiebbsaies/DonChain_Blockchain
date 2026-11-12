import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/Header";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DonChain — dons traçables",
  description: "Suivez chaque don, de la collecte au paiement du prestataire, sur la blockchain.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning : les extensions (portefeuilles, traducteurs, correcteurs) modifient
    // les attributs de <html>/<body> avant l'hydratation, ce qui déclenchait un faux avertissement.
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col font-sans" suppressHydrationWarning>
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
          <footer className="border-t border-line py-6 text-center text-xs text-ink-muted">
            Les fonds sont sous séquestre on-chain. La blockchain fait foi.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
