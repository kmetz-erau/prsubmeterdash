import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AiM Meter Intelligence',
  description: 'Operational dashboard for AssetWorks AiM meter readings.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
