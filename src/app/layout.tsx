import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { NotificationToastProvider } from "@/components/NotificationToastProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tourmageddon.it",
  description: "Tour Operations Dashboard",
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
  },
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NotificationToastProvider>
          {children}
        </NotificationToastProvider>
        <Toaster
          position="top-right"
          richColors
          closeButton
          duration={Infinity}
          gap={12}
          toastOptions={{
            style: {
              padding: '16px 20px',
              fontSize: '14px',
              minWidth: '380px',
              borderRadius: '12px',
              boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05)',
              backdropFilter: 'blur(8px)',
            },
            classNames: {
              toast: 'group',
              title: 'text-[15px] font-semibold tracking-tight',
              description: 'text-[13px] mt-1.5 opacity-90 leading-relaxed',
              actionButton: 'bg-white/20 hover:bg-white/30 text-white font-medium px-3 py-1.5 rounded-lg text-xs transition-all',
              closeButton: 'opacity-50 hover:opacity-100 transition-opacity',
            },
          }}
          expand={true}
        />
      </body>
    </html>
  );
}
