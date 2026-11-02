import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SKP Activity Tracker",
  description: "Pencatatan aktivitas kerja untuk kebutuhan SKP.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
