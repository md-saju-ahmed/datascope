import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: { default: 'DataScope', template: '%s | DataScope' },
  description: 'Enterprise data discovery workspace',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/favicon.svg',
  },
};
const themeScript = `(function(){try{var t=localStorage.getItem('datascope-theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var isDark=t==='dark'||(!t&&d);var cl=document.documentElement.classList;if(isDark){cl.add('dark');cl.remove('light')}else{cl.remove('dark');cl.add('light')}document.documentElement.style.colorScheme=isDark?'dark':'light'}catch(e){}})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
