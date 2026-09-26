import type { Metadata } from "next";
import { Geist, Geist_Mono, Orbitron, VT323 } from "next/font/google";
import "./globals.css";
import { THEME_SCRIPT } from "@/lib/theme-script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Heading fonts for the Woshi Neon and Retro themes. Not preloaded: the
// browser only downloads them when a page uses one of those themes.
const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  preload: false,
});

const vt323 = VT323({
  variable: "--font-vt323",
  subsets: ["latin"],
  weight: "400",
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: "Jephelen — Your AI copilot for running a smarter business",
    template: "%s | Jephelen",
  },
  description:
    "Jephelen is an AI business copilot that helps freelancers manage customers, organize tasks, generate communications, track money, and make smarter business decisions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${orbitron.variable} ${vt323.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Sets the theme before the first paint (see components/theme.tsx) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
