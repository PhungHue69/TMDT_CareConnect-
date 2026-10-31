"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { drugs, type Drug, type DrugCategory } from "@/lib/api";
import Thumb from "@/components/Thumb";

const TABS: { label: string; value?: DrugCategory }[] = [
  { label: "Tất cả" },
  { label: "OTC", value: "OTC" },
  { label: "TPCN", value: "TPCN" },
  { label: "Rx", value: "RX" },
];

const price = (n: number) => (n > 0 ? `${n.toLocaleString("vi-VN")}đ` : "Giá tại nhà thuốc");

function Catalog() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const raw = sp.get("category")?.toUpperCase();
  const category = TABS.find((t) => t.value === raw)?.value;

  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [res, setRes] = useState<{ key: string; list: Drug[]; error?: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const key = `${category ?? ""}|${dq}`;
  useEffect(() => {
    let stale = false;
    drugs({ category, q: dq || undefined })
      .then((list) => !stale && setRes({ key, list }))
      .catch((e: Error) => !stale && setRes({ key, list: [], error: e.message }));
    return () => {
      stale = true;
    };
  }, [category, dq, key]);

  const loading = res?.key !== key;

  function pick(v?: DrugCategory) {
    router.replace(v ? `${pathname}?category=${v}` : pathname);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">Thuốc</h1>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Tìm thuốc theo tên hoặc hoạt chất"
        aria-label="Tìm thuốc"
        className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
      />
      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.label}
            role="tab"
            aria-selected={t.value === category}
            onClick={() => pick(t.value)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${
              t.value === category ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:bg-brand-soft"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p>Đang tải...</p>}
      {res && !loading && res.error && <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger-ink">{res.error}</p>}
      {res && !loading && !res.error && res.list.length === 0 && <p>Không tìm thấy thuốc.</p>}

      <ul className="grid gap-3 sm:grid-cols-2">
        {!loading &&
          res?.list.map((d) => (
            <li key={d.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm min-[420px]:flex-row">
              <Thumb src={d.image_url} kind="drug" alt={d.name} size={96} />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{d.name}</p>
                  <p className="text-sm text-muted">{d.active_ingredient}</p>
                </div>
                <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-dark">{d.category}</span>
              </div>
              <p className="text-sm font-semibold">
                {price(d.price)}
                {d.unit ? ` / ${d.unit}` : ""}
              </p>
              {d.category === "RX" ? (
                <div className="flex items-center gap-3">
                  <button disabled className="rounded-xl border border-line bg-gray-100 px-3 py-1.5 text-sm text-gray-500 opacity-70">
                    Cần đơn
                  </button>
                  <Link href="/" className="text-sm font-semibold text-brand underline">
                    Chọn nhà thuốc để gửi ảnh đơn
                  </Link>
                </div>
              ) : (
                <Link href="/" className="self-start rounded-xl bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark">
                  Chọn nhà thuốc để xem hàng
                </Link>
              )}
              </div>
            </li>
          ))}
      </ul>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="text-muted">Đang tải...</p>}>
      <Catalog />
    </Suspense>
  );
}
