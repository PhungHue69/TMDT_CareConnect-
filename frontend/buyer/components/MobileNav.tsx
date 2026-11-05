"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { showDemoNotice } from "./DemoToast";
import { HomeIcon, OrderIcon, PinIcon, UserIcon } from "./icons";

const item = "flex min-h-12 flex-col items-center justify-center gap-0.5 text-[0.6875rem]";

export default function MobileNav() {
  const pathname = usePathname();
  const onPharmacies = pathname === "/" || pathname.startsWith("/pharmacies/");

  return (
    <nav aria-label="Điều hướng điện thoại" className="fixed inset-x-0 bottom-0 z-[1100] grid grid-cols-4 border-t border-line bg-white px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5 md:hidden">
      <button type="button" onClick={() => showDemoNotice("Trang chủ")} className={`${item} text-muted`}><HomeIcon />Trang chủ</button>
      <Link href="/" aria-current={onPharmacies ? "page" : undefined} className={`${item} font-semibold ${onPharmacies ? "text-brand" : "text-muted"}`}><PinIcon />Nhà thuốc</Link>
      <button type="button" onClick={() => showDemoNotice("Đơn hàng")} className={`${item} text-muted`}><OrderIcon />Đơn hàng</button>
      <button type="button" onClick={() => showDemoNotice("Tài khoản")} className={`${item} text-muted`}><UserIcon />Tài khoản</button>
    </nav>
  );
}
