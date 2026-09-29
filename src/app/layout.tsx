import type { Metadata, Viewport } from "next";
import { PwaProvider } from "@/components/pwa-provider";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Wedding Camera",
  description: "A private disposable camera for wedding guests.",
  applicationName: "Wedding Camera",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Camera", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#272522" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><PwaProvider>{children}</PwaProvider></body>
    </html>
  );
}
