import type { AnalyzeResult, Drug } from "@/lib/api";
import { formatPrice, packsOf } from "./cartActions";
import Thumb from "./Thumb";

/** Read-out table of the analyzed prescription: OCR quantity vs. max packs the cart will hold. */
export default function PrescriptionItems({ items, catalog }: { items: AnalyzeResult["items"]; catalog: Drug[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-left text-sm">
        <thead className="bg-page">
          <tr>
            <th className="p-2">Tên thuốc</th>
            <th className="p-2">Liều dùng</th>
            <th className="p-2">SL</th>
            <th className="p-2">Tối đa (giỏ)</th>
            <th className="p-2">Hệ thống</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => {
            const d = catalog.find((x) => x.id === it.matched_drug_id);
            return (
              <tr key={i} className="border-t border-line">
                <td className="p-2">{it.name}</td>
                <td className="p-2">{it.dosage}</td>
                <td className="p-2">{it.quantity}</td>
                <td className="p-2 whitespace-nowrap">
                  {it.matched_drug_id == null ? <span className="text-muted">—</span> : `Tối đa ${packsOf(it)} hộp`}
                </td>
                <td className="p-2">
                  {it.matched_drug_id == null ? (
                    <span className="text-muted">Không có trong hệ thống</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      {d && <Thumb src={d.image_url} kind="drug" alt={d.name} size={40} />}
                      <span>
                        {d?.name ?? `Thuốc #${it.matched_drug_id}`}
                        {d && <span className="text-muted"> — {formatPrice(d.price)}</span>}
                      </span>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
