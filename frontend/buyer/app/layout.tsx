import type { Metadata } from "next";
import { Suspense } from "react";
import DemoToast from "@/components/DemoToast";
import Header from "@/components/Header";
import MobileNav from "@/components/MobileNav";
import { PharmacySessionProvider } from "@/components/PharmacySession";
import "./globals.css";

// Display face for page titles; self-hosted by next/font so it also loads over the LAN demo.

export const metadata: Metadata = {
  title: "CareConnect — Mua thuốc",
  description: "Tìm nhà thuốc gần bạn, gửi ảnh đơn thuốc hoặc mua thuốc không kê đơn",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi">
      <body className="flex min-h-screen flex-col">
        <a href="/" className="block bg-white px-4 py-2 font-semibold text-brand">← CareConnect · Các phân hệ</a>
        <PharmacySessionProvider>
          <Suspense fallback={<div className="h-[4.25rem] bg-brand sm:h-[4.75rem]" />}><Header /></Suspense>
          <main className="flex-1 px-4 pb-24 pt-4 sm:px-8 md:pb-8">{children}</main>
          <footer className="hidden border-t border-line bg-white md:block">
            <div className="mx-auto flex max-w-[80rem] flex-wrap items-center justify-between gap-2 px-8 py-5 text-sm text-muted">
              <span>© 2026 CareConnect · Sức khỏe trong tầm tay</span>
              <span>Bản demo: tồn kho là dữ liệu mẫu; nhà thuốc và thuốc lấy từ Long Châu.</span>
            </div>
          </footer>
          <Suspense fallback={null}><MobileNav /></Suspense>
          <DemoToast />
        </PharmacySessionProvider>
      </body>
    </html>
  );
}
