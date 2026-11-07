import Link from "next/link";

export default function Page() {
  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-2xl border border-line bg-white p-6">
      <h1 className="text-2xl font-bold">Gửi ảnh đơn thuốc</h1>
      <p>Để ảnh đơn được gửi đúng nhà thuốc, hãy chọn vị trí và chọn nhà thuốc trên bản đồ trước.</p>
      <p>AI chỉ sàng lọc ảnh có vẻ là đơn thuốc. Việc kiểm tra đơn và quyết định bán thuốc thuộc dược sĩ.</p>
      <Link href="/" className="inline-block rounded-xl bg-brand px-4 py-3 font-bold text-white">Mở bản đồ chọn nhà thuốc</Link>
    </div>
  );
}
