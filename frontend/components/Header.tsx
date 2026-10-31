"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { cartCount, subscribeCart } from "@/lib/cart";
import { showDemoNotice } from "./DemoToast";
import { CartIcon, HomeIcon, LogoMark, OrderIcon, PinIcon, UserIcon } from "./icons";

const getCount = () => cartCount();
const getServerCount = () => 0;
const pill = "flex items-center gap-2 rounded-xl px-4 py-2.5 text-[0.9375rem] font-medium";

export default function Header() {
  const pathname = usePathname();
  const count = useSyncExternalStore(subscribeCart, getCount, getServerCount);
  const onPharmacies = pathname === "/" || pathname.startsWith("/pharmacies/");

  return (
    <header className="bg-brand text-white">
      <div className="mx-auto flex max-w-[80rem] items-center gap-4 px-4 py-3 sm:px-8 sm:py-4">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Thuốc Gần Bạn - Nhà thuốc">
          <LogoMark className="h-9 w-9 sm:h-11 sm:w-11" />
          <span className="leading-tight">
            <span className="block text-lg font-bold sm:text-xl">Thuốc Gần Bạn</span>
            <span className="block text-xs text-white/85">Sức khỏe trong tầm tay</span>
          </span>
        </Link>

        <nav aria-label="Điều hướng chính" className="ml-6 hidden items-center gap-1 md:flex">
          <button type="button" onClick={() => showDemoNotice("Trang chủ")} className={`${pill} text-white/90 hover:bg-white/10`}>
            <HomeIcon /> Trang chủ
          </button>
          <Link href="/" aria-current={onPharmacies ? "page" : undefined} className={`${pill} ${onPharmacies ? "bg-white/20 font-semibold" : "text-white/90 hover:bg-white/10"}`}>
            <PinIcon /> Nhà thuốc
          </Link>
          <button type="button" onClick={() => showDemoNotice("Đơn hàng")} className={`${pill} text-white/90 hover:bg-white/10`}>
            <OrderIcon /> Đơn hàng
          </button>
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Link href="/cart" aria-label={`Giỏ hàng, ${count} sản phẩm`} className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 hover:bg-white/25">
            <CartIcon />
            {count > 0 && (
              <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FFB020] px-1 text-[0.6875rem] font-bold text-ink">
                {count}
              </span>
            )}
          </Link>
          <button type="button" onClick={() => showDemoNotice("Tài khoản")} className="hidden h-11 items-center gap-2 rounded-xl bg-white px-4 text-[0.9375rem] font-semibold text-brand md:flex">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft"><UserIcon className="h-4 w-4" /></span>
            Tài khoản
          </button>
        </div>
      </div>
    </header>
  );
}
