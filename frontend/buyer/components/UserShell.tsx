"use client";

/*
 * Khung chung của ứng dụng Người dùng: menu trái (laptop), thanh tab dưới (điện thoại), thanh trên có giỏ hàng + chuông.
 * Bản HTML của cùng khung nằm ở frontend/buyer-family/js/layout.js: thứ tự menu, icon và kích thước phải giống nhau
 * để người dùng không thấy đang chuyển giữa hai ứng dụng.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { cartCount, subscribeCart } from "@/lib/cart";
import { buyerFetch } from "@/lib/buyerApi";

const ICONS: Record<string, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  cart: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></>,
  video: <><path d="m23 7-7 5 7 5z" /><rect x="1" y="5" width="15" height="14" rx="2" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></>,
  pill: <><path d="M10.5 20.5a5 5 0 0 1-7-7l10-10a5 5 0 0 1 7 7z" /><path d="m8.5 8.5 7 7" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
  user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  heart: <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />,
};

function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      {ICONS[name]}
    </svg>
  );
}

// next: đường dẫn trong ứng dụng Next (basePath /shop); còn lại là trang Family Care
const NAV: { key: string; label: string; icon: string; next?: string; href?: string; mobile?: boolean }[] = [
  { key: "home", label: "Trang chủ", icon: "home", href: "/buyer-family/index.html", mobile: true },
  { key: "shop", label: "Mua thuốc", icon: "cart", next: "/", mobile: true },
  { key: "doctor", label: "Khám bác sĩ", icon: "video", next: "/doctor" },
  { key: "orders", label: "Đơn hàng", icon: "file", next: "/orders", mobile: true },
  { key: "reminders", label: "Lịch thuốc", icon: "pill", href: "/buyer-family/reminders.html" },
  { key: "family", label: "Gia đình", icon: "users", href: "/buyer-family/family.html", mobile: true },
  { key: "notifications", label: "Thông báo", icon: "bell", href: "/buyer-family/notifications.html" },
  { key: "profile", label: "Tài khoản", icon: "user", href: "/buyer-family/profile.html", mobile: true },
];

function section(pathname: string): { key: string; title: string } {
  if (pathname.startsWith("/doctor")) return { key: "doctor", title: "Khám bác sĩ" };
  if (pathname.startsWith("/orders")) return { key: "orders", title: "Đơn hàng" };
  if (pathname.startsWith("/cart")) return { key: "shop", title: "Giỏ hàng" };
  return { key: "shop", title: "Mua thuốc" };
}

function NavLink({ item, active, cls }: { item: (typeof NAV)[number]; active: boolean; cls: string }) {
  const body = <><Icon name={item.icon} /><span>{item.label}</span></>;
  const className = `${cls}${active ? " active" : ""}`;
  return item.next
    ? <Link href={item.next} className={className} aria-current={active ? "page" : undefined}>{body}</Link>
    : <a href={item.href} className={className}>{body}</a>;
}

const getCount = () => cartCount();
const getServerCount = () => 0;

export default function UserShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { key, title } = section(pathname);
  const cart = useSyncExternalStore(subscribeCart, getCount, getServerCount);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    buyerFetch<{ unread: number }>("/notifications?limit=1").then((r) => setUnread(r.unread)).catch(() => setUnread(0));
  }, [pathname]);

  return (
    <div className="us-app">
      <aside className="us-sidebar">
        <a className="us-brand" href="/buyer-family/index.html"><span className="us-brand-mark"><Icon name="heart" size={18} /></span>CareConnect</a>
        {NAV.map((n) => <NavLink key={n.key} item={n} active={n.key === key} cls="us-nav-link" />)}
        {/* Cổng chọn phân hệ nằm ngoài ứng dụng Next (basePath /shop), nên dùng <a> thường */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <div className="us-sidebar-footer"><a href="/">← Đổi phân hệ (demo)</a></div>
      </aside>
      <header className="us-topbar">
        <div className="us-topbar-title">{title}</div>
        <Link className="us-icon-btn" href="/cart" aria-label={`Giỏ hàng, ${cart} sản phẩm`}>
          <Icon name="cart" />{cart > 0 && <span className="us-count">{cart}</span>}
        </Link>
        <a className="us-icon-btn" href="/buyer-family/notifications.html" aria-label="Thông báo">
          <Icon name="bell" />{unread > 0 && <span className="us-count">{unread > 99 ? "99+" : unread}</span>}
        </a>
      </header>
      <main className="us-content">{children}</main>
      <nav className="us-tabbar" aria-label="Điều hướng điện thoại">
        {NAV.filter((n) => n.mobile).map((n) => <NavLink key={n.key} item={n} active={n.key === key} cls="us-tab" />)}
      </nav>
    </div>
  );
}
