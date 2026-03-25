import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'FountainFlow — Music-Synchronized Fountain Choreography',
    template: '%s | FountainFlow',
  },
  description:
    'Convert any song to fountain choreography in minutes. Upload audio, configure your hardware, and get downloadable Arduino, DMX, and ESP32 control code with a 3D preview.',
  keywords: [
    'fountain choreography',
    'music fountain',
    'Arduino fountain',
    'DMX fountain',
    'water show',
    'fountain control',
  ],
  authors: [{ name: 'FountainFlow' }],
  creator: 'FountainFlow',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://fountainflow.io',
    siteName: 'FountainFlow',
    title: 'FountainFlow — Music-Synchronized Fountain Choreography',
    description: 'Convert any song to fountain choreography in minutes.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FountainFlow',
    description: 'Convert any song to fountain choreography in minutes.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#042f52',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${inter.variable} dark`} suppressHydrationWarning>
        <body className={`${inter.className} min-h-screen bg-background antialiased`}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
