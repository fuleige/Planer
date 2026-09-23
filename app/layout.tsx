import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '序时 · 事项规划',
  description: '把目标、项目和任务整理成清晰的今日行动。',
  icons: {
    icon: [{ url: '/favicon.png', type: 'image/png', sizes: '64x64' }],
    apple: [{ url: '/app-icon.png', type: 'image/png', sizes: '512x512' }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
