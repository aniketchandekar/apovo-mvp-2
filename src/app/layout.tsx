import type { Metadata, Viewport } from 'next';
import './globals.css';
import { TestModeProvider } from '@/components/application-test/TestModeContext';
import { DemoSessionProvider } from '@/components/demo/DemoSessionProvider';

export const metadata: Metadata = {
  title: 'Apovo | Care Concierge for Breast Cancer Support',
  description: 'Apovo matches breast cancer patients with grants and practical assistance, prepares applications with your approval, and follows up until support arrives.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FFFFFF',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <DemoSessionProvider>
          <TestModeProvider>
            <main className="apovo-app-root">
              {children}
            </main>
          </TestModeProvider>
        </DemoSessionProvider>
      </body>
    </html>
  );
}
