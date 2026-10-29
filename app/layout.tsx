import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FitPass — Gym membership in Benin City",
  description:
    "Buy a gym plan, get your FitPass code, and check in at the desk in seconds. FitPass Gym, Adesuwa Road, GRA, Benin City.",
};

export const viewport: Viewport = {
  themeColor: "#0F7B4F",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-NG" className={cn("scroll-smooth", inter.variable, poppins.variable)}>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
