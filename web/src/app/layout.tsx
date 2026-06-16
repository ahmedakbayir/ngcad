import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NGCAD — Yönetim Paneli',
  description: 'Kullanıcı, firma ve proje yönetimi',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className="h-full">
      <body className="h-full antialiased">{children}</body>
    </html>
  );
}
