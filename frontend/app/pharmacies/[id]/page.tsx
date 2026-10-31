import { Suspense } from "react";
import Link from "next/link";
import PharmacyDetail from "@/components/PharmacyDetail";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p role="status">Đang tải nhà thuốc…</p>}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pharmacyId = Number(id);
  if (!Number.isSafeInteger(pharmacyId) || pharmacyId <= 0 || String(pharmacyId) !== id) {
    return <div className="mx-auto max-w-xl rounded-2xl bg-white p-6"><h1 className="text-xl font-bold">Không tìm thấy nhà thuốc</h1><Link className="font-bold text-brand underline" href="/">← Về bản đồ</Link></div>;
  }
  return <PharmacyDetail pharmacyId={pharmacyId} />;
}
