"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BuyerApiError,
  buyerContext,
  loginUrl,
  PAYMENT_OPTIONS,
  personLabel,
  type Address,
  type BuyerContext,
  type PaymentGateway,
} from "@/lib/buyerApi";

export type SessionState =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "error"; message: string }
  | { status: "ready"; ctx: BuyerContext; meId: number };

/** Người đang đăng nhập (dùng chung với Family Care) và danh sách người nhận / địa chỉ dùng được. */
export function useBuyerSession(): [SessionState, () => void] {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    // buyerFetch báo 401 ngay khi chưa đăng nhập, nên mọi cập nhật state đều nằm trong callback
    buyerContext()
      .then((ctx) => { if (alive) setState({ status: "ready", ctx, meId: ctx.people[0].id }); })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof BuyerApiError && e.status === 401) setState({ status: "guest" });
        else setState({ status: "error", message: e instanceof Error ? e.message : "Không tải được thông tin tài khoản" });
      });
    return () => { alive = false; };
  }, [version]);

  // Đăng nhập ở tab khác (trang đăng nhập Family Care) rồi quay lại: tải lại
  useEffect(() => {
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, [reload]);

  return [state, reload];
}

export function LoginPrompt({ text }: { text: string }) {
  const href = typeof window === "undefined" ? "#" : loginUrl(window.location.pathname + window.location.search);
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-white p-5 text-center shadow-sm">
      <p>{text}</p>
      <a href={href} className="inline-flex rounded-xl bg-brand px-5 py-2.5 font-bold text-white hover:bg-brand-dark">
        Đăng nhập CareConnect
      </a>
      <p className="text-xs text-muted">Dùng chung tài khoản với Family Care.</p>
    </div>
  );
}

const field = "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[0.9375rem] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";
const labelCls = "mb-1 block text-sm font-semibold";

export function RecipientPicker({ ctx, meId, value, onChange, label = "Người nhận thuốc" }: {
  ctx: BuyerContext; meId: number; value: number; onChange: (id: number) => void; label?: string;
}) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <select className={field} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {ctx.people.map((p) => <option key={p.id} value={p.id}>{personLabel(p, meId)}</option>)}
      </select>
      {ctx.people.length === 1 && (
        <span className="mt-1 block text-xs text-muted">
          Muốn đặt thuốc cho bố mẹ? <a className="font-semibold text-brand underline" href="/buyer-family/family.html?tab=add">Liên kết với gia đình</a>
        </span>
      )}
    </label>
  );
}

/** Địa chỉ của mình hoặc của người nhận. Tự chọn địa chỉ phù hợp khi đổi người nhận. */
export function AddressPicker({ ctx, meId, recipientId, value, onChange }: {
  ctx: BuyerContext; meId: number; recipientId: number; value: number | null; onChange: (id: number | null) => void;
}) {
  const options = ctx.addresses.filter((a) => a.user_id === meId || a.user_id === recipientId);
  const pickedFor = useRef<number | null>(null);
  useEffect(() => {
    // Giữ lựa chọn của người dùng, nhưng đổi người nhận thì chọn lại địa chỉ của người đó
    if (pickedFor.current === recipientId && value !== null && options.some((a) => a.id === value)) return;
    pickedFor.current = recipientId;
    const preferred = options.find((a) => a.user_id === recipientId && a.is_default)
      || options.find((a) => a.user_id === recipientId)
      || options.find((a) => recipientId !== meId && /bố|mẹ|ông|bà/i.test(a.label || ""))
      || options.find((a) => a.is_default)
      || options[0];
    onChange(preferred ? preferred.id : null);
  }, [recipientId, options.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!options.length) {
    return (
      <p className="rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn-ink">
        Chưa có địa chỉ nhận thuốc. <a className="font-semibold underline" href="/buyer-family/profile.html">Thêm địa chỉ trong Tài khoản</a> rồi quay lại.
      </p>
    );
  }
  return (
    <label className="block">
      <span className={labelCls}>Giao tới</span>
      <select className={field} value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))}>
        {options.map((a: Address) => (
          <option key={a.id} value={a.id}>
            {(a.label ? `${a.label}: ` : "") + `${a.recipient_name} · ${a.address_line}`}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PaymentPicker({ value, onChange, allowCod = true }: {
  value: PaymentGateway; onChange: (v: PaymentGateway) => void; allowCod?: boolean;
}) {
  return (
    <label className="block">
      <span className={labelCls}>Thanh toán</span>
      <select className={field} value={value} onChange={(e) => onChange(e.target.value as PaymentGateway)}>
        {PAYMENT_OPTIONS.filter((o) => allowCod || o.value !== "COD").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span className="mt-1 block text-xs text-muted">
        Thanh toán mô phỏng. Tiền được sàn tạm giữ (Escrow) và chỉ chuyển cho nhà thuốc khi bạn nhận thuốc.
      </span>
    </label>
  );
}

export const inputClass = field;
export const labelClass = labelCls;
