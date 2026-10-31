"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { pharmacyDetail, pharmacyRating, type PharmacyDetail as PharmacyData, type PharmacyRating } from "@/lib/api";
import { clearCart, getCart, setPharmacy } from "@/lib/cart";
import { usePharmacySession } from "./PharmacySession";
import PrescriptionFlow from "./PrescriptionFlow";
import SupplementFlow from "./SupplementFlow";
import { CheckIcon, NavigateIcon, PillIcon, PinIcon, RxIcon, StarIcon } from "./icons";
import Thumb from "./Thumb";

type Loaded = { id: number; pharmacy: PharmacyData | null; error: string | null };

export default function PharmacyDetail({ pharmacyId }: { pharmacyId: number }) {
  const { setSelected, pos, draftImage, setDraftImage, draftPharmacyId, setDraftPharmacyId } = usePharmacySession();
  const [confirmed, setConfirmed] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [tab, setTab] = useState<"rx" | "otc">("rx");
  const [rating, setRating] = useState<{ id: number; data: PharmacyRating } | null>(null);

  useEffect(() => {
    let active = true;
    pharmacyDetail(pharmacyId)
      .then((pharmacy) => { if (active) setLoaded({ id: pharmacyId, pharmacy, error: null }); })
      .catch((e) => { if (active) setLoaded({ id: pharmacyId, pharmacy: null, error: e instanceof Error ? e.message : "Không tìm thấy nhà thuốc." }); });
    return () => { active = false; };
  }, [pharmacyId]);

  useEffect(() => {
    let active = true;
    void pharmacyRating(pharmacyId).then((data) => { if (active) setRating({ id: pharmacyId, data }); });
    return () => { active = false; };
  }, [pharmacyId]);

  const pharmacy = loaded?.id === pharmacyId ? loaded.pharmacy : null;
  const googleRating = rating?.id === pharmacyId ? rating.data : null;
  const cartPharmacyId = getCart().pharmacy?.id;
  const hasOtherCart = cartPharmacyId !== undefined && cartPharmacyId !== pharmacyId && getCart().items.length > 0;
  const needsConfirmation = hasOtherCart || (!!draftImage && draftPharmacyId !== pharmacyId);
  const active = !needsConfirmation || confirmed;

  function switchPharmacy() {
    if (!pharmacy) return;
    if (needsConfirmation) {
      clearCart();
      setDraftImage(null);
      setDraftPharmacyId(null);
    }
    setPharmacy({ id: pharmacy.id, name: pharmacy.name });
    setSelected(pharmacy);
    setConfirmed(true);
  }

  const distance = pharmacy && pos
    ? (() => {
        const rad = Math.PI / 180;
        const dLat = (pharmacy.latitude - pos.lat) * rad;
        const dLng = (pharmacy.longitude - pos.lng) * rad;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(pos.lat * rad) * Math.cos(pharmacy.latitude * rad) * Math.sin(dLng / 2) ** 2;
        return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      })()
    : null;

  const card = "mx-auto max-w-xl space-y-4 rounded-[1.25rem] border border-line bg-white p-6";
  if (!loaded || loaded.id !== pharmacyId) return <p role="status" className="mx-auto max-w-[80rem] py-10 text-muted">Đang tải nhà thuốc…</p>;
  if (!pharmacy) return <div className={`${card} mt-6`}><h1 className="text-xl font-bold">Không tìm thấy nhà thuốc</h1><p className="text-muted">{loaded.error}</p><Link href="/" className="font-semibold text-brand underline">← Về bản đồ</Link></div>;
  if (!active) return <div className={`${card} mt-6`}><h1 className="text-xl font-bold">Đổi nhà thuốc?</h1><p>Đổi sang {pharmacy.name} sẽ xóa giỏ hàng và ảnh đơn chưa gửi.</p><div className="flex flex-wrap gap-3"><button type="button" onClick={switchPharmacy} className="h-11 rounded-xl bg-brand px-5 font-semibold text-white">Xóa và đổi nhà thuốc</button><Link href="/" className="flex h-11 items-center rounded-xl border border-[#D5DCE8] px-5 font-semibold text-brand">Giữ nhà thuốc cũ</Link></div></div>;
  if (cartPharmacyId !== pharmacyId && !confirmed) return <div className={`${card} mt-6`}><h1 className="text-xl font-bold">Mở nhà thuốc</h1><p>Bạn đang xem {pharmacy.name}. Hãy xác nhận để bắt đầu mua hàng.</p><div className="flex flex-wrap gap-3"><button type="button" onClick={switchPharmacy} className="h-11 rounded-xl bg-brand px-5 font-semibold text-white">Chọn nhà thuốc này</button><Link href="/" className="flex h-11 items-center rounded-xl border border-[#D5DCE8] px-5 font-semibold text-brand">Về bản đồ</Link></div></div>;

  const services = [
    { id: "rx" as const, title: "Thuốc theo đơn", text: "Tải ảnh đơn thuốc, dược sĩ sẽ kiểm tra và xác nhận", Icon: RxIcon },
    { id: "otc" as const, title: "Thực phẩm chức năng", text: "Mua TPCN và thuốc không kê đơn còn hàng tại đây", Icon: PillIcon },
  ];
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${pharmacy.latitude},${pharmacy.longitude}`;

  return (
    <div className="-mx-4 -mt-4 sm:-mx-8">
      <section className="border-b border-line bg-white">
        <div className="mx-auto max-w-[80rem] px-3 py-3 sm:px-8 sm:py-5 sm:pb-5 sm:pt-4">
          <div className="flex flex-wrap items-center gap-3 sm:gap-5">
            <Thumb src={pharmacy.image_url} kind="pharmacy" alt={pharmacy.name} size={76} className="hidden rounded-2xl bg-brand-soft/60 sm:block" />
            
            <div className="min-w-0 flex-[1_1_420px] space-y-1.5">
              <h1 className="text-base font-bold leading-snug tracking-tight text-brand [text-wrap:balance] sm:text-xl">{pharmacy.name}</h1>
              <p className="flex gap-1.5 text-sm text-muted"><PinIcon className="mt-0.5 h-4 w-4 shrink-0" /><span>{pharmacy.address}</span></p>
              <div className="flex flex-wrap gap-2.5">
                {googleRating && googleRating.rating !== null && (
                  <a href={googleRating.url ?? undefined} target="_blank" rel="noreferrer" aria-label={`Đánh giá Google Maps: ${googleRating.rating} trên 5 sao`} className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-page px-3 text-[0.8125rem] text-ink hover:border-brand">
                    <StarIcon className="h-4 w-4 text-[#FFB020]" />
                    <strong className="font-bold text-brand">{googleRating.rating.toFixed(1)}</strong>
                    {googleRating.count !== null && <span className="text-muted">({googleRating.count.toLocaleString("vi-VN")})</span>}
                    <span className="hidden text-xs text-muted sm:inline">· Google Maps</span>
                  </a>
                )}
                {distance !== null && <span className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-page px-3 text-[0.8125rem] text-ink"><NavigateIcon className="h-4 w-4 text-brand" />Cách bạn {distance.toFixed(1)} km</span>}
                {pharmacy.phone && <span className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-page px-3 text-[0.8125rem] text-ink">☎ {pharmacy.phone}</span>}
              </div>
            </div>
            <div className="flex w-full flex-wrap gap-2.5 sm:w-auto">
              <Link href="/" className="flex h-9 flex-1 items-center justify-center gap-2 rounded-xl border border-[#D5DCE8] bg-white px-4 text-[0.8125rem] sm:h-10 sm:text-sm font-semibold text-ink hover:border-brand sm:flex-none">← Về bản đồ</Link>
              <a href={directions} target="_blank" rel="noreferrer" className="flex h-9 flex-1 items-center justify-center gap-2 rounded-xl bg-[#EAF1FE] px-4 text-[0.8125rem] sm:h-10 sm:text-sm font-semibold text-brand hover:bg-brand-soft sm:flex-none"><NavigateIcon />Chỉ đường</a>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="svc-title" className="mx-auto max-w-[80rem] space-y-2.5 px-3 pt-3 sm:space-y-3 sm:px-8 sm:pt-5">
        <div className="space-y-1">
          <h2 id="svc-title" className="text-lg font-bold text-brand">Chọn loại dịch vụ</h2>
          <p className="hidden text-sm text-muted sm:block">Bạn muốn tìm thuốc theo cách nào?</p>
        </div>
        <div role="tablist" aria-label="Loại dịch vụ" className="grid grid-cols-2 gap-2.5 sm:gap-4">
          {services.map(({ id, title, text, Icon }) => {
            const on = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`detail-tab-${id}`}
                aria-controls={`detail-panel-${id}`}
                aria-selected={on}
                onClick={() => setTab(id)}
                className={`flex min-w-0 items-center gap-2.5 rounded-2xl border-2 px-3 py-2.5 text-left sm:gap-3.5 sm:px-4 sm:py-3 ${on ? "border-brand bg-[#F3F7FF]" : "border-line bg-white hover:border-[#B9C8E6]"}`}
              >
                <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11 ${on ? "bg-brand text-white" : "bg-[#EAF1FE] text-brand"}`}><Icon className="h-5 w-5 sm:h-6 sm:w-6" /></span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm font-bold leading-tight text-brand sm:text-base">{title}</strong>
                  <span className="hidden text-[0.8125rem] text-muted sm:block">{text}</span>
                </span>
                <span aria-hidden="true" className={`hidden h-[1.375rem] w-[1.375rem] shrink-0 sm:flex items-center justify-center rounded-full ${on ? "bg-brand text-white" : "border-2 border-[#C3CBDA]"}`}>{on && <CheckIcon className="h-3.5 w-3.5" />}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="mx-auto max-w-[80rem] px-3 pb-10 pt-3 sm:px-8 sm:pt-5">
        <div role="tabpanel" id="detail-panel-rx" aria-labelledby="detail-tab-rx" hidden={tab !== "rx"}>
          <PrescriptionFlow pharmacy={{ ...pharmacy, distance_km: distance ?? 0 }} file={draftPharmacyId === pharmacyId ? draftImage : null} onFile={(file) => { setDraftImage(file); setDraftPharmacyId(file ? pharmacyId : null); }} />
        </div>
        <div role="tabpanel" id="detail-panel-otc" aria-labelledby="detail-tab-otc" hidden={tab !== "otc"}>
          <SupplementFlow pharmacy={{ ...pharmacy, distance_km: distance ?? 0 }} />
        </div>
      </div>
    </div>
  );
}
