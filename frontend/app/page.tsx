"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import LocationPanel from "@/components/LocationPanel";
import { usePharmacySession } from "@/components/PharmacySession";
import type { Pharmacy } from "@/lib/api";
import { clearCart, getCart, setPharmacy, subscribeCart } from "@/lib/cart";
import { decidePharmacySelection } from "@/lib/pharmacySelection";

const cartSnapshot = () => JSON.stringify(getCart());

export default function Page() {
  const router = useRouter();
  const { pos, setPos, selected, setSelected, draftImage, setDraftImage, draftPharmacyId, setDraftPharmacyId } = usePharmacySession();
  const [pendingPharmacy, setPendingPharmacy] = useState<Pharmacy | null>(null);
  const cartText = useSyncExternalStore(subscribeCart, cartSnapshot, () => "");
  const cart = cartText ? JSON.parse(cartText) as ReturnType<typeof getCart> : null;

  function select(p: Pharmacy) {
    const currentId = selected?.id ?? cart?.pharmacy?.id ?? null;
    const hasDraftOrCart = (!!draftImage && draftPharmacyId !== p.id) || (cart?.items.length ?? getCart().items.length) > 0;
    const decision = decidePharmacySelection(currentId, p.id, hasDraftOrCart);
    if (decision === "confirm") {
      setPendingPharmacy(p);
      return;
    }
    if (currentId !== null && currentId !== p.id) {
      clearCart();
      setDraftImage(null);
      setDraftPharmacyId(null);
    }
    setPharmacy({ id: p.id, name: p.name });
    setSelected(p);
    router.push(`/pharmacies/${p.id}`);
  }

  function confirmSwitch() {
    if (!pendingPharmacy) return;
    const p = pendingPharmacy;
    clearCart();
    setDraftImage(null);
    setDraftPharmacyId(null);
    setPharmacy({ id: p.id, name: p.name });
    setSelected(p);
    setPendingPharmacy(null);
    router.push(`/pharmacies/${p.id}`);
  }

  return (
    <div>
      <LocationPanel
        pos={pos}
        onPos={setPos}
        selectedPharmacy={selected ? { ...selected, distance_km: 0 } : null}
        onChoosePharmacy={select}
      />
      {pendingPharmacy && (
        <div role="dialog" aria-modal="true" aria-label="Đổi nhà thuốc" className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold">Đổi nhà thuốc?</h2>
            <p>Đổi sang {pendingPharmacy.name} sẽ xóa giỏ hàng và ảnh đơn chưa gửi.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={confirmSwitch} className="rounded-xl bg-brand px-4 py-2 font-bold text-white">Xóa và đổi nhà thuốc</button>
              <button type="button" onClick={() => setPendingPharmacy(null)} className="rounded-xl border border-line px-4 py-2">Giữ nhà thuốc cũ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
