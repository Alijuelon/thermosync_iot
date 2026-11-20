import type { Metadata } from 'next';
import { Outfit, DM_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-outfit',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-mono',
});

export const metadata: Metadata = {
  title: 'ThermoSync IoT — Smart AC Controller',
  description:
    'Kontrol & Monitoring AC Universal Berbasis IoT (ESP32).',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  openGraph: {
    title: 'ThermoSync IoT — Smart AC Controller',
    description:
      'Kontrol & Monitoring AC Universal Berbasis IoT (ESP32).',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ThermoSync IoT — Smart AC Controller',
    description:
      'Kontrol & Monitoring AC Universal Berbasis IoT (ESP32).',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      className={`dark ${outfit.variable} ${dmSans.variable} ${ibmPlexMono.variable}`}
      suppressHydrationWarning
    >
      <body
        className="min-h-screen bg-slate-50 text-slate-900 dark:bg-zinc-950 dark:text-zinc-50 font-sans antialiased selection:bg-sky-500/20 selection:text-sky-500 transition-colors duration-200"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
