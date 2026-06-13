import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DontPanic',
  description: "The answer to building any system. Don't Panic.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
