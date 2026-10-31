// Simulated only: no real call/payment. ponytail: add real telehealth when a provider exists.
export default function Page() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Tư vấn Bác sĩ</h1>
      <p className="text-sm text-muted">
        Thuốc kê đơn chỉ được bán theo đơn của bác sĩ. Hãy tư vấn bác sĩ để được kê đơn đúng quy định.
      </p>
      <div className="space-y-2 rounded-2xl border border-line bg-white p-5 shadow-sm">
        <div className="font-semibold">BS. Nguyễn Văn An (demo)</div>
        <div className="text-sm text-muted">Chuyên khoa: Nội tổng quát</div>
        <div className="text-sm">Phí tư vấn: 20.000đ</div>
        <button disabled className="mt-2 w-full cursor-not-allowed rounded-xl bg-gray-300 px-4 py-2.5 font-bold text-gray-600">
          Gọi — Sắp có
        </button>
      </div>
      <p className="text-xs text-muted">Tính năng mô phỏng, chưa có cuộc gọi hay thanh toán thật.</p>
    </div>
  );
}
