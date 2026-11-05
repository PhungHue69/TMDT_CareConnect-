"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { locations, nearby, resolveAddress, suggestAddresses, type Location, type Pharmacy } from "@/lib/api";
import { AddressLookup, shouldAutoChoose, type AddressSuggestion } from "@/lib/addressSearch";
import { locationForProvince, locationForWard } from "@/lib/wardLocation";
import type { Pos } from "./cartActions";
import { ChevronIcon, GpsIcon, NavigateIcon, PinIcon, SearchIcon } from "./icons";
import Thumb from "./Thumb";

const PharmacyMap = dynamic(() => import("@/components/PharmacyMap"), {
  ssr: false,
  loading: () => <div className="h-[clamp(16rem,42vh,24rem)] w-full animate-pulse rounded-[1.25rem] bg-line lg:order-2 lg:h-[45rem]" />,
});

type Near = { key: string; list: Pharmacy[]; error: string | null };

export default function LocationPanel({
  pos,
  onPos,
  selectedPharmacy,
  onChoosePharmacy,
}: {
  pos: Pos | null;
  onPos: (p: Pos) => void;
  selectedPharmacy: Pharmacy | null;
  onChoosePharmacy: (p: Pharmacy) => void;
}) {
  const [address, setAddress] = useState("");
  const [resolvedAddress, setResolvedAddress] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const addressLookup = useRef(new AddressLookup());
  const addressVersion = useRef<number | null>(null);
  const [locs, setLocs] = useState<Location[]>([]);
  const [locError, setLocError] = useState<string | null>(null);
  const [provinceSel, setProvinceSel] = useState<string | null>(null);
  const [ward, setWard] = useState("");
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsWarn, setGpsWarn] = useState<string | null>(null);
  const [near, setNear] = useState<Near | null>(null);
  const [pendingLocation, setPendingLocation] = useState<Pos | null>(null);
  const nearbyRequest = useRef(0);
  const [retry, setRetry] = useState(0); // bump to refetch nearby for the same position
  const [shown, setShown] = useState<{ key: string | null; count: number }>({ key: null, count: 3 });
  const [highlight, setHighlight] = useState<number | undefined>(undefined);
  const gpsId = useRef(0);

  useEffect(() => {
    let live = true;
    locations()
      .then((l) => live && setLocs(l))
      .catch((e) => live && setLocError(e instanceof Error ? e.message : "Không tải được danh sách tỉnh/phường."));
    return () => {
      live = false;
    };
  }, []);

  // Selected province, defaulting to HCM (else first). Derived, so no effect needed.
  const province = locs.find((l) => l.province === provinceSel) ?? locs.find((l) => /hồ chí minh/i.test(l.province)) ?? locs[0];
  const wardObj = province?.wards.find((w) => w.ward === ward);

  const committedPos = pos ? `${pos.lat},${pos.lng}` : null;
  const onPosRef = useRef(onPos);
  const selectedRef = useRef(!!selectedPharmacy);
  const posRef = useRef(committedPos);
  useEffect(() => {
    onPosRef.current = onPos;
    selectedRef.current = !!selectedPharmacy;
    posRef.current = committedPos;
  }, [onPos, selectedPharmacy, committedPos]);

  // Shared by the 1s debounce and the "Tìm kiếm" button; stale versions are dropped.
  const lookupAddress = useRef(async (query: string, version: number) => {
    setAddressBusy(true);
    setAddressError(null);
    try {
      const { suggestions: options } = await suggestAddresses(query);
      if (!addressLookup.current.isCurrent(version)) return;
      setSuggestions(options);
      const single = shouldAutoChoose(options);
      if (single) {
        const location = await resolveAddress(single.place_id);
        if (!addressLookup.current.isCurrent(version)) return;
        if (selectedRef.current && posRef.current && `${location.lat},${location.lng}` !== posRef.current) setPendingLocation(location);
        else { onPosRef.current(location); setResolvedAddress(query); }
        setSuggestions([]);
      } else if (options.length === 0) {
        setAddressError("Không tìm thấy địa chỉ này. Hãy nhập rõ hơn hoặc dùng GPS / Tỉnh / Phường.");
      }
    } catch (e) {
      if (addressLookup.current.isCurrent(version)) {
        setAddressError(e instanceof Error ? e.message : "Không tra được địa chỉ. Hãy thử lại hoặc dùng GPS.");
      }
    } finally {
      if (addressLookup.current.isCurrent(version)) setAddressBusy(false);
    }
  });

  useEffect(() => {
    const query = address.trim();
    if (query.length < 2 || query === resolvedAddress) return;
    const timer = setTimeout(() => {
      const version = addressVersion.current;
      if (version === null || !addressLookup.current.isCurrent(version)) return;
      void lookupAddress.current(query, version);
    }, 1000);
    return () => clearTimeout(timer);
  }, [address, resolvedAddress]);

  async function searchNow() {
    const query = address.trim();
    if (query.length < 2) return;
    // a fresh version cancels the pending debounce result and any older lookup
    const version = addressLookup.current.start(query);
    addressVersion.current = version;
    if (version !== null) await lookupAddress.current(query, version);
  }

  async function selectSuggestion(suggestion: AddressSuggestion) {
    const version = addressVersion.current;
    if (version === null) return;
    setAddressBusy(true);
    setAddressError(null);
    try {
      const location = await resolveAddress(suggestion.place_id);
      if (!addressLookup.current.isCurrent(version)) return;
      proposeLocation(location);
      setAddress(suggestion.description);
      if (!selectedPharmacy || !pos) setResolvedAddress(suggestion.description);
      setSuggestions([]);
    } catch (e) {
      if (addressLookup.current.isCurrent(version)) {
        setAddressError(e instanceof Error ? e.message : "Không xác định được vị trí. Hãy thử địa chỉ khác.");
      }
    } finally {
      if (addressLookup.current.isCurrent(version)) setAddressBusy(false);
    }
  }

  const posKey = pos ? `${pos.lat},${pos.lng}` : null;
  useEffect(() => {
    if (!pos || !posKey) return;
    const requests = nearbyRequest;
    const request = ++requests.current;
    nearby(pos.lat, pos.lng)
      .then((list) => request === requests.current && setNear({ key: posKey, list, error: null }))
      .catch(
        (e) =>
          request === requests.current &&
          setNear({
            key: posKey,
            list: [],
            error: `Không tải được danh sách nhà thuốc: ${e instanceof Error ? e.message : "lỗi không xác định"}`,
          }),
      );
    return () => {
      requests.current++;
    };
    // pos is only read for its coordinates, which posKey encodes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posKey, retry]);

  function proposeLocation(next: Pos) {
    if (selectedPharmacy && pos && (next.lat !== pos.lat || next.lng !== pos.lng)) setPendingLocation(next);
    else onPos(next);
  }

  function selectLocation(next: Pos) {
    addressLookup.current.invalidate();
    addressVersion.current = null;
    setAddressBusy(false);
    setSuggestions([]);
    setAddressError(null);
    setAddress("");
    setResolvedAddress("");
    // a late GPS fix must not override the location the user just selected
    gpsId.current++;
    setGpsBusy(false);
    proposeLocation(next);
    setGpsWarn(null);
  }

  function useGps() {
    addressLookup.current.invalidate();
    addressVersion.current = null;
    setAddressBusy(false);
    setSuggestions([]);
    setAddressError(null);
    setAddress("");
    setResolvedAddress("");
    const id = ++gpsId.current;
    setGpsWarn(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsWarn("Trình duyệt không hỗ trợ GPS. Hãy chọn Tỉnh / Thành hoặc Xã / Phường để dùng vị trí khu vực.");
      return;
    }
    setGpsBusy(true);
    const fail = () => {
      if (id !== gpsId.current) return;
      gpsId.current++;
      setGpsBusy(false);
      setGpsWarn("Không lấy được vị trí GPS. Hãy chọn Tỉnh / Thành hoặc Xã / Phường để dùng vị trí khu vực.");
    };
    // getCurrentPosition's own timeout does not cover the permission prompt, so guard it too
    const timer = setTimeout(fail, 10000);
    try {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          clearTimeout(timer);
          if (id !== gpsId.current) return;
          gpsId.current++;
          setGpsBusy(false);
          const lat = p.coords.latitude;
          const lng = p.coords.longitude;
          proposeLocation({ lat, lng, label: `Vị trí GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})` });
        },
        () => {
          clearTimeout(timer);
          fail();
        },
        { timeout: 10000 },
      );
    } catch {
      clearTimeout(timer);
      fail();
    }
  }

  const nearNow = near && near.key === posKey ? near : null;
  const loading = pos !== null && !nearNow;
  const visibleCount = shown.key === posKey ? shown.count : 3;
  const visiblePharmacies = nearNow?.list.slice(0, visibleCount) ?? [];
  const highlightId = highlight ?? selectedPharmacy?.id;

  function clearAddress() {
    addressLookup.current.invalidate();
    addressVersion.current = null;
    setSuggestions([]);
    setAddress("");
    setAddressError(null);
    setAddressBusy(false);
  }

  return (
    <section aria-labelledby="loc-h" className="-mx-4 -mt-4 sm:-mx-8">
      {pendingLocation && <div role="dialog" aria-modal="true" aria-label="Cập nhật vị trí" className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
          <h3 className="text-lg font-bold">Cập nhật vị trí tìm nhà thuốc?</h3>
          <p>Bạn muốn tìm nhà thuốc quanh vị trí mới hay giữ nguyên vị trí cũ? Nhà thuốc đang chọn, giỏ hàng và ảnh chưa gửi vẫn giữ nguyên cho đến khi bạn chọn nhà thuốc khác.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { onPos(pendingLocation); setPendingLocation(null); }} className="rounded-xl bg-brand px-4 py-2 font-bold text-white">Tìm quanh vị trí mới</button>
            <button type="button" onClick={() => setPendingLocation(null)} className="rounded-xl border border-line px-4 py-2">Giữ vị trí cũ</button>
          </div>
        </div>
      </div>}

      {/* Search band */}
      <div className="border-b border-line bg-white">
        <div className="mx-auto max-w-[80rem] space-y-3 px-3 py-4 sm:space-y-4 sm:px-8 sm:py-8">
          <div className="space-y-0.5 sm:space-y-1.5">
            <h1 id="loc-h" className="font-display text-[1.375rem] font-bold tracking-[-0.02em] text-brand [text-wrap:balance] sm:text-[2rem]">Tìm nhà thuốc gần bạn</h1>
            <p className="text-xs text-muted sm:text-base">Gửi đơn thuốc hoặc mua thực phẩm chức năng tại nhà thuốc gần nhất.</p>
          </div>

          <form
            role="search"
            onSubmit={(e) => { e.preventDefault(); void searchNow(); }}
            className="flex gap-1.5 sm:gap-3"
          >
            <label htmlFor="addr" className="sr-only">Tìm địa chỉ</label>
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted sm:left-4 sm:h-5 sm:w-5" />
              <input
                id="addr"
                type="search"
                className="h-10 w-full rounded-xl border border-[#D5DCE8] bg-white pl-9 pr-2 text-sm sm:h-[3.375rem] sm:rounded-[0.875rem] sm:pl-12 sm:pr-4 outline-none focus:border-brand focus:ring-2 focus:ring-brand/25 sm:h-[3.375rem] sm:text-base"
                placeholder="Nhập địa chỉ…"
                value={address}
                onChange={(e) => {
                  const next = e.target.value;
                  addressVersion.current = addressLookup.current.start(next);
                  gpsId.current++;
                  setGpsBusy(false);
                  setAddress(next);
                  setSuggestions([]);
                  setAddressError(null);
                  setAddressBusy(false);
                }}
                autoComplete="street-address"
              />
            </div>
            <button
              type="button"
              onClick={useGps}
              disabled={gpsBusy}
              aria-label="Dùng GPS"
              className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#D5DCE8] bg-white px-2.5 text-sm font-semibold sm:rounded-[0.875rem] sm:px-5 text-brand hover:bg-brand-soft/50 disabled:opacity-60 sm:h-[3.375rem] sm:text-base"
            >
              <GpsIcon className="h-[1.125rem] w-[1.125rem] sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">{gpsBusy ? "Đang lấy…" : "Dùng GPS"}</span>
            </button>
            <button
              type="submit"
              disabled={addressBusy || address.trim().length < 2}
              className="h-10 shrink-0 rounded-xl bg-brand px-3 text-sm font-semibold sm:rounded-[0.875rem] sm:px-7 text-white hover:bg-brand-dark disabled:opacity-60 sm:h-[3.375rem] sm:text-base"
            >
              {addressBusy ? "Đang tìm…" : "Tìm kiếm"}
            </button>
          </form>

          {(addressError || gpsWarn || locError || suggestions.length > 1) && (
            <div className="space-y-2">
              {addressError && <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger-ink">{addressError}</p>}
              {gpsWarn && <p role="alert" className="rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn-ink">{gpsWarn}</p>}
              {locError && <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger-ink">{locError}</p>}
              {suggestions.length > 1 && (
                <div className="rounded-2xl border border-line bg-white p-2 shadow-sm">
                  <p className="px-2 py-1 text-sm text-muted">Có nhiều địa chỉ trùng tên. Hãy chọn đúng địa chỉ:</p>
                  <ul aria-label="Địa chỉ gợi ý">
                    {suggestions.map((item) => (
                      <li key={item.place_id}>
                        <button type="button" onClick={() => void selectSuggestion(item)} className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-page">
                          <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{item.description}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={clearAddress} className="px-2 py-2 text-sm font-semibold text-brand underline">Giữ vị trí cũ và xóa địa chỉ đang tìm</button>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-1.5 sm:flex sm:flex-wrap sm:gap-2.5">
            <span className={`flex h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold sm:h-11 sm:gap-2 sm:px-5 sm:text-[0.9375rem] ${pos ? "bg-brand text-white" : "border border-[#D5DCE8] bg-white text-muted"}`}>
              <PinIcon className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" />
              Gần bạn
            </span>
            <div className="relative min-w-0 sm:shrink-0">
              <label htmlFor="prov" className="sr-only">Tỉnh / Thành</label>
              <select
                id="prov"
                className="h-9 w-full appearance-none truncate rounded-full border border-[#D5DCE8] bg-white pl-3 pr-7 text-xs text-ink sm:h-11 sm:w-auto sm:max-w-[14rem] sm:pl-[1.125rem] sm:pr-11 sm:text-[0.9375rem] outline-none focus:border-brand focus:ring-2 focus:ring-brand/25"
                value={province?.province ?? ""}
                onChange={(e) => {
                  const selectedProvince = locs.find((item) => item.province === e.target.value);
                  setProvinceSel(e.target.value);
                  setWard("");
                  const location = locationForProvince(selectedProvince);
                  if (location) selectLocation(location);
                }}
                disabled={locs.length === 0}
              >
                {locs.length === 0 && <option value="">Tỉnh/Thành…</option>}
                {locs.map((l) => (
                  <option key={l.province} value={l.province}>{l.province}</option>
                ))}
              </select>
              <ChevronIcon className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink sm:right-4 sm:h-4 sm:w-4" />
            </div>
            <div className="relative min-w-0 sm:shrink-0">
              <label htmlFor="ward" className="sr-only">Xã / Phường</label>
              <select
                id="ward"
                className="h-9 w-full appearance-none truncate rounded-full border border-[#D5DCE8] bg-white pl-3 pr-7 text-xs text-ink sm:h-11 sm:w-auto sm:max-w-[14rem] sm:pl-[1.125rem] sm:pr-11 sm:text-[0.9375rem] outline-none focus:border-brand focus:ring-2 focus:ring-brand/25"
                value={wardObj ? ward : ""}
                onChange={(e) => {
                  const selectedWard = e.target.value;
                  setWard(selectedWard);
                  const location = locationForWard(province, selectedWard);
                  if (location) selectLocation(location);
                }}
                disabled={!province}
              >
                <option value="">Xã/Phường</option>
                {province?.wards.map((w) => (
                  <option key={w.ward} value={w.ward}>{w.ward}</option>
                ))}
              </select>
              <ChevronIcon className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink sm:right-4 sm:h-4 sm:w-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Results: list left, map right on desktop; map first on phones */}
      <div className="mx-auto grid max-w-[80rem] gap-4 px-3 py-4 sm:gap-5 sm:px-8 sm:py-6 lg:grid-cols-[400px_minmax(0,1fr)] lg:gap-6">
        <PharmacyMap
          user={pos}
          pharmacies={nearNow?.list ?? []}
          chosenId={highlightId}
          onChoose={onChoosePharmacy}
          onHighlight={setHighlight}
          className="h-[clamp(14rem,34vh,22rem)] lg:order-2 lg:h-[45rem]"
        />

        <section aria-labelledby="list-title" className="min-w-0 space-y-2.5 sm:space-y-3.5 lg:order-1 lg:max-h-[45rem] lg:overflow-y-auto lg:pr-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <PinIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand sm:mt-1 sm:h-6 sm:w-6" />
              <div className="min-w-0">
                <h2 id="list-title" className="text-base font-bold text-brand sm:text-[1.3125rem]">Nhà thuốc gần bạn</h2>
                <p role="status" className="truncate text-xs text-muted sm:text-sm">
                  {!pos ? "Chọn vị trí để xem nhà thuốc" : loading ? "Đang tải…" : nearNow?.error ? "Không tải được" : `${nearNow?.list.length ?? 0} nhà thuốc gần ${pos.label}`}
                </p>
              </div>
            </div>
            <div className="relative shrink-0">
              <label htmlFor="sort" className="sr-only">Sắp xếp</label>
              <select id="sort" className="h-8 appearance-none rounded-lg border border-[#D5DCE8] bg-white pl-2.5 pr-7 text-xs text-ink sm:h-10 sm:rounded-xl sm:pl-3.5 sm:pr-9 sm:text-sm" defaultValue="near">
                <option value="near">Gần nhất</option>
              </select>
              <ChevronIcon className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink sm:right-3 sm:h-4 sm:w-4" />
            </div>
          </div>

          {!pos && (
            <div className="rounded-2xl border border-dashed border-[#B9C8E6] bg-white p-5 text-sm text-muted">
              Nhập địa chỉ, bấm <strong className="text-brand">Dùng GPS</strong> hoặc chọn <strong className="text-brand">Tỉnh/Thành, Xã/Phường</strong> để xem nhà thuốc gần bạn.
            </div>
          )}
          {nearNow?.error && (
            <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger-ink">
              {nearNow.error}{" "}
              <button type="button" onClick={() => { setNear(null); setRetry((r) => r + 1); }} className="font-bold underline">Thử lại</button>
            </p>
          )}
          {nearNow && !nearNow.error && nearNow.list.length === 0 && <p className="text-sm text-muted">Không có nhà thuốc nào gần đây.</p>}

          {visiblePharmacies.length > 0 && (
            <ul className="space-y-2 sm:space-y-3.5">
              {visiblePharmacies.map((p) => {
                const on = p.id === highlightId;
                return (
                  <li key={p.id}>
                    <article
                      onClick={() => setHighlight(p.id)}
                      className={`cursor-pointer rounded-2xl border bg-white p-2.5 transition-shadow sm:rounded-[1.125rem] sm:p-4 ${on ? "border-brand shadow-[0_0_0_1px_#1A56DB,0_6px_18px_rgba(26,86,219,0.12)]" : "border-line shadow-[0_1px_2px_rgba(15,30,61,0.04)] hover:border-[#B9C8E6]"}`}
                    >
                      <div className="flex min-w-0 gap-2.5 sm:gap-4">
                        <Thumb src={p.image_url} kind="pharmacy" alt={p.name} size={56} className="rounded-xl bg-brand-soft/60 sm:hidden" />
                        <Thumb src={p.image_url} kind="pharmacy" alt={p.name} size={88} className="hidden rounded-2xl bg-brand-soft/60 sm:block" />
                        <div className="min-w-0 flex-1 space-y-0.5 sm:space-y-1.5">
                          <h3 title={p.name} className="line-clamp-2 text-sm font-bold leading-snug text-brand sm:text-[1.0625rem]">{p.name}</h3>
                          <p className="flex gap-1 text-xs text-muted sm:gap-1.5 sm:text-sm"><PinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" /><span className="line-clamp-2 sm:line-clamp-none">{p.address}</span></p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 sm:mt-3 sm:gap-3">
                        <span className="flex items-center gap-1 text-[0.8125rem] font-semibold text-brand sm:gap-1.5 sm:text-[0.9375rem]"><NavigateIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />{p.distance_km.toFixed(1)} km</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onChoosePharmacy(p); }}
                          className="h-8 rounded-lg bg-brand px-3 text-[0.8125rem] font-semibold text-white hover:bg-brand-dark sm:h-11 sm:rounded-xl sm:px-5 sm:text-[0.9375rem]"
                        >
                          Chọn nhà thuốc
                        </button>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
          {nearNow && !nearNow.error && nearNow.list.length > visibleCount && (
            <button type="button" onClick={() => setShown({ key: posKey, count: visibleCount + 3 })} className="h-10 w-full rounded-xl border border-dashed border-[#B9C8E6] bg-white text-sm sm:h-12 sm:rounded-[0.875rem] sm:text-[0.9375rem] font-semibold text-brand hover:bg-brand-soft/40">
              Xem thêm nhà thuốc
            </button>
          )}
        </section>
      </div>
    </section>
  );
}
