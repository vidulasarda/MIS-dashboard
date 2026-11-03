import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MIS Dashboard',
  description: 'Upload any company’s financials, get an instant MIS dashboard.',
};

// Fonts load in the browser (not at build time), so a Google Fonts hiccup can never fail a deploy.
// If the fonts cannot load, the fallbacks below are used.
const fontVars = {
  '--font-fraunces': "'Fraunces', Georgia, 'Times New Roman', serif",
  '--font-inter': "'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif",
  '--font-plexmono': "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace",
} as React.CSSProperties;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={fontVars}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body className="bg-paper text-ink font-body">{children}</body>
    </html>
  );
}
