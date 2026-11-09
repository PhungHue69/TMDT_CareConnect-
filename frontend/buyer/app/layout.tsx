import type { Metadata } from "next";
import { Suspense } from "react";
import { PharmacySessionProvider } from "@/components/PharmacySession";
import UserShell from "@/components/UserShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareConnect — Người dùng",
  description: "Mua thuốc, gửi đơn thuốc, khám bác sĩ online và chăm sóc sức khỏe gia đình",
};

// Mua thuốc, Khám bác sĩ, Đơn hàng là một phần của ứng dụng Người dùng: dùng chung khung với các trang Family Care
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi">
      <body>
        <PharmacySessionProvider>
          <Suspense fallback={null}>
            <UserShell>
              {children}
              <p className="mt-10 text-center text-xs text-muted">
                Bản demo: tồn kho và thanh toán là dữ liệu mẫu; nhà thuốc và thuốc lấy từ Long Châu.
              </p>
            </UserShell>
          </Suspense>
        </PharmacySessionProvider>
      </body>
    </html>
  );
}
