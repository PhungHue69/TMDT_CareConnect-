"use client";

// Khám bác sĩ online (TV3) và đặt lịch phòng khám. Bác sĩ chỉ khám, thu phí và kê đơn;
// người bệnh cầm đơn điện tử gửi cho nhà thuốc gần nhà để được báo giá.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import {
  bookClinic,
  bookConsultation,
  cancelClinicBooking,
  cancelConsultation,
  clinics as loadClinics,
  doctors as loadDoctors,
  myClinicBookings,
  myConsultations,
  rxPharmacies,
  sendEPrescription,
  type Clinic,
  type ClinicBooking,
  type Consultation,
  type Doctor,
  type PaymentGateway,
  type RxPharmacy,
} from "@/lib/buyerApi";
import { LoginPrompt, PaymentPicker, RecipientPicker, inputClass, labelClass, useBuyerSession, type SessionState } from "@/components/BuyerSession";

type Ready = Extract<SessionState, { status: "ready" }>;
const vnd = (n: number | string) => `${Number(n || 0).toLocaleString("vi-VN")}đ`;
const when = (s: string) => new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
const MODE_LABEL: Record<string, string> = { CHAT: "Nhắn tin", AUDIO: "Gọi thoại", VIDEO: "Gọi video" };
const CONS_STATUS: Record<string, [string, string]> = {
  WAITING: ["Chờ bác sĩ nhận", "bg-warn-bg text-warn-ink"],
  IN_PROGRESS: ["Đang khám", "bg-brand-soft text-brand-dark"],
  COMPLETED: ["Đã khám", "bg-[#dcfce7] text-[#14713A]"],
  CANCELLED: ["Đã hủy", "bg-danger-bg text-danger-ink"],
};
const btn = "rounded-xl bg-brand px-4 py-2.5 font-bold text-white hover:bg-brand-dark disabled:opacity-50";

type Tab = "doctors" | "mine" | "clinics";

export default function Page() {
  return <Suspense fallback={<p className="text-muted">Đang tải...</p>}><DoctorPage /></Suspense>;
}

// ?tab=mine | clinics: mở thẳng từ thông báo "Bác sĩ đã kê đơn" hoặc ô "Đặt lịch phòng khám" của Family Care
function DoctorPage() {
  const params = useSearchParams();
  const initial = params.get("tab");
  const [session] = useBuyerSession();
  const [tab, setTab] = useState<Tab>(initial === "mine" || initial === "clinics" ? initial : "doctors");
  const tabCls = (active: boolean) => `flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${active ? "bg-white text-brand shadow-sm" : "text-muted"}`;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="text-sm text-muted">Thuốc kê đơn chỉ được bán theo đơn của bác sĩ. Khám online, nhận đơn điện tử rồi gửi cho nhà thuốc gần nhà.</p>
      <div className="flex gap-1 rounded-2xl bg-[#eaf0f7] p-1">
        <button className={tabCls(tab === "doctors")} onClick={() => setTab("doctors")}>Bác sĩ</button>
        <button className={tabCls(tab === "mine")} onClick={() => setTab("mine")}>Lịch khám của tôi</button>
        <button className={tabCls(tab === "clinics")} onClick={() => setTab("clinics")}>Phòng khám</button>
      </div>
      {session.status === "loading" && <p className="text-muted">Đang tải...</p>}
      {session.status === "guest" && <LoginPrompt text="Đăng nhập để đặt khám cho bạn hoặc người thân." />}
      {session.status === "error" && <p role="alert" className="text-danger-ink">{session.message}</p>}
      {session.status === "ready" && (
        tab === "doctors" ? <DoctorList session={session} onBooked={() => setTab("mine")} />
          : tab === "mine" ? <MyConsultations session={session} />
            : <Clinics session={session} />
      )}
      <p className="text-xs text-muted">Bản mô phỏng phục vụ học tập: thanh toán là giả lập, bác sĩ và phòng khám là dữ liệu mẫu.</p>
    </div>
  );
}

// ------------------------------------------------------------------ danh sách bác sĩ & đặt khám

function DoctorList({ session, onBooked }: { session: Ready; onBooked: () => void }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<Doctor[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadDoctors(q).then((r) => setList(r.doctors)).catch(() => setList([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="space-y-3">
      <input className={inputClass} placeholder="Tìm theo tên bác sĩ hoặc chuyên khoa..." value={q} onChange={(e) => setQ(e.target.value)} />
      {!list ? <p className="text-muted">Đang tải...</p> : !list.length ? <p className="text-muted">Không tìm thấy bác sĩ phù hợp.</p> : (
        <ul className="space-y-3">
          {list.map((d) => (
            <li key={d.id} className="space-y-2 rounded-2xl border border-line bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold">{d.full_name}</p>
                  <p className="text-sm text-muted">
                    {d.specialty || "Đa khoa"}{d.workplace ? ` · ${d.workplace}` : ""}{d.years_of_experience ? ` · ${d.years_of_experience} năm kinh nghiệm` : ""}
                  </p>
                  {d.rating ? <p className="text-sm">★ {Number(d.rating).toFixed(1)} <span className="text-muted">({d.rating_count} đánh giá)</span></p> : null}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${d.is_online ? "bg-[#dcfce7] text-[#14713A]" : "bg-page text-muted"}`}>
                  {d.is_online ? "Đang trực" : "Ngoại tuyến"}
                </span>
              </div>
              {d.bio && <p className="text-sm">{d.bio}</p>}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">
                  Phí khám <b>{vnd(d.consultation_fee)}</b> · {(d.consultation_modes || []).map((m) => MODE_LABEL[m] || m).join(", ")}
                </span>
                <button className={btn} onClick={() => setOpen(open === d.id ? null : d.id)}>{open === d.id ? "Đóng" : "Đặt khám"}</button>
              </div>
              {open === d.id && <BookingForm doctor={d} session={session} onBooked={onBooked} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BookingForm({ doctor, session, onBooked }: { doctor: Doctor; session: Ready; onBooked: () => void }) {
  const modes = doctor.consultation_modes?.length ? doctor.consultation_modes : ["CHAT" as const];
  const [patient, setPatient] = useState(session.meId);
  const [mode, setMode] = useState<string>(modes[0]);
  const [symptom, setSymptom] = useState("");
  const [gateway, setGateway] = useState<PaymentGateway>("MOMO");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await bookConsultation({ doctor_profile_id: doctor.id, patient_user_id: patient, mode, symptom_description: symptom, payment_gateway: gateway });
      onBooked();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đặt được lịch khám");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl bg-page p-4">
      <RecipientPicker ctx={session.ctx} meId={session.meId} value={patient} onChange={setPatient} label="Người được khám" />
      <label className="block">
        <span className={labelClass}>Hình thức</span>
        <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value)}>
          {modes.map((m) => <option key={m} value={m}>{MODE_LABEL[m] || m}</option>)}
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Triệu chứng</span>
        <textarea className={`${inputClass} min-h-24`} value={symptom} onChange={(e) => setSymptom(e.target.value)}
          placeholder="Ví dụ: Ho khan 3 ngày, sốt nhẹ buổi tối, đang dùng thuốc huyết áp..." />
      </label>
      <PaymentPicker value={gateway} onChange={setGateway} allowCod={false} />
      {error && <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger-ink">{error}</p>}
      <button className={`${btn} w-full`} disabled={busy || symptom.trim().length < 5} onClick={submit}>
        {busy ? "Đang đặt..." : `Thanh toán ${vnd(doctor.consultation_fee)} & đặt khám`}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ lịch khám & đơn điện tử

function MyConsultations({ session }: { session: Ready }) {
  const [list, setList] = useState<Consultation[] | null>(null);
  const load = useCallback(() => {
    myConsultations().then((r) => setList(r.consultations)).catch(() => setList([]));
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  if (!list) return <p className="text-muted">Đang tải...</p>;
  if (!list.length) return <p className="rounded-2xl border border-line bg-white p-6 text-center">Chưa có lịch khám nào.</p>;

  return (
    <ul className="space-y-3">
      {list.map((c) => {
        const [label, cls] = CONS_STATUS[c.status] || [c.status, "bg-page text-muted"];
        return (
          <li key={c.id} className="space-y-2 rounded-2xl border border-line bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold">{c.doctor_name}</p>
                <p className="text-sm text-muted">{c.specialty || "Đa khoa"} · {MODE_LABEL[c.mode] || c.mode} · {when(c.created_at)}</p>
                {c.patient_user_id !== session.meId && <p className="text-sm">Người được khám: <b>{c.patient_name}</b></p>}
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{label}</span>
            </div>
            {c.symptom_description && <p className="text-sm text-muted">Triệu chứng: {c.symptom_description}</p>}
            {c.status === "WAITING" && (
              <p className="text-sm">Bác sĩ sẽ liên hệ {c.mode === "CHAT" ? "qua tin nhắn" : "qua điện thoại"}.{" "}
                <button className="font-semibold text-danger-ink underline" onClick={() => cancelConsultation(c.id).then(load).catch((e) => window.alert(e.message))}>Hủy & hoàn phí</button>
              </p>
            )}
            {c.diagnosis && <p className="text-sm">Chẩn đoán: <b>{c.diagnosis}</b></p>}
            {c.prescription_id && c.items && (
              <div className="rounded-xl bg-page p-3 text-sm">
                <p className="mb-1 font-semibold">Đơn thuốc điện tử{c.valid_until ? ` · hiệu lực tới ${new Date(c.valid_until).toLocaleDateString("vi-VN")}` : ""}</p>
                <ul>{c.items.map((i, k) => <li key={k}>• {i.name} × {i.quantity}{i.dosage ? ` · ${i.dosage}` : ""}{i.usage ? ` · ${i.usage}` : ""}</li>)}</ul>
                <SendToPharmacy prescriptionId={c.prescription_id} patientId={c.patient_user_id} session={session} />
              </div>
            )}
            <p className="text-right text-sm text-muted">Phí khám {vnd(c.fee_amount)}</p>
          </li>
        );
      })}
    </ul>
  );
}

// Chọn vị trí (địa chỉ đã lưu) → nhà thuốc gần đó còn nhiều thuốc trong đơn → gửi đơn để được báo giá
function SendToPharmacy({ prescriptionId, patientId, session }: { prescriptionId: number; patientId: number; session: Ready }) {
  const addresses = session.ctx.addresses.filter((a) => a.user_id === patientId || a.user_id === session.meId);
  const [open, setOpen] = useState(false);
  const [addressId, setAddressId] = useState<number | null>(addresses.find((a) => a.user_id === patientId)?.id ?? addresses[0]?.id ?? null);
  const [list, setList] = useState<RxPharmacy[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const a = addresses.find((x) => x.id === addressId);
    if (!open || !a) return;
    rxPharmacies(prescriptionId, Number(a.latitude), Number(a.longitude)).then((r) => setList(r.pharmacies)).catch(() => setList([]));
  }, [open, addressId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(p: RxPharmacy) {
    setMsg(null);
    try {
      await sendEPrescription({ pharmacy_id: p.id, prescription_id: prescriptionId });
      setMsg(`Đã gửi đơn tới ${p.name}. Dược sĩ báo giá xong bạn sẽ nhận chuông báo.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Không gửi được đơn");
    }
  }

  if (!open) return <button className={`${btn} mt-2`} onClick={() => setOpen(true)}>Gửi đơn cho nhà thuốc</button>;
  if (!addresses.length) {
    return <p className="mt-2 text-sm">Cần địa chỉ để tìm nhà thuốc gần. <a className="font-semibold text-brand underline" href="/buyer-family/profile.html">Thêm địa chỉ</a></p>;
  }
  return (
    <div className="mt-3 space-y-2">
      <label className="block">
        <span className={labelClass}>Tìm nhà thuốc gần</span>
        <select className={inputClass} value={addressId ?? ""} onChange={(e) => { setList(null); setAddressId(Number(e.target.value)); }}>
          {addresses.map((a) => <option key={a.id} value={a.id}>{(a.label ? `${a.label}: ` : "") + a.address_line}</option>)}
        </select>
      </label>
      {!list ? <p className="text-muted">Đang tìm...</p> : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {list.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{p.name}</p>
                <p className="text-xs text-muted">{p.distance_km} km · có {p.in_stock}/{p.total_items} thuốc trong đơn</p>
              </div>
              <button className="shrink-0 rounded-lg border border-brand px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand-soft" onClick={() => send(p)}>Gửi</button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-dark">{msg} <Link href="/orders" className="font-semibold underline">Xem Đơn hàng</Link></p>}
    </div>
  );
}

// ------------------------------------------------------------------ phòng khám

function Clinics({ session }: { session: Ready }) {
  const [list, setList] = useState<Clinic[] | null>(null);
  const [bookings, setBookings] = useState<ClinicBooking[]>([]);
  const [clinicId, setClinicId] = useState<number | null>(null);
  const [patient, setPatient] = useState(session.meId);
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    myClinicBookings().then((r) => setBookings(r.bookings)).catch(() => {});
  }, []);
  useEffect(() => {
    loadClinics().then((r) => { setList(r.clinics); setClinicId(r.clinics[0]?.id ?? null); }).catch(() => setList([]));
    load();
  }, [load]);

  async function submit() {
    if (!clinicId || !time) return;
    setMsg(null);
    try {
      const r = await bookClinic({ clinic_id: clinicId, patient_user_id: patient, booking_time: new Date(time).toISOString(), symptom_note: note });
      setMsg(`Đã đặt lịch tại ${r.clinic_name}.`);
      setNote("");
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Không đặt được lịch");
    }
  }

  if (!list) return <p className="text-muted">Đang tải...</p>;
  const selected = list.find((c) => c.id === clinicId);

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">Đặt lịch khám tại phòng khám</h2>
        <label className="block">
          <span className={labelClass}>Phòng khám</span>
          <select className={inputClass} value={clinicId ?? ""} onChange={(e) => setClinicId(Number(e.target.value))}>
            {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {selected && (
          <p className="text-sm text-muted">
            {selected.address}{selected.phone ? ` · ${selected.phone}` : ""}
            {selected.doctors?.length ? ` · Bác sĩ: ${selected.doctors.map((d) => d.name).join(", ")}` : ""}
          </p>
        )}
        <RecipientPicker ctx={session.ctx} meId={session.meId} value={patient} onChange={setPatient} label="Người đi khám" />
        <label className="block">
          <span className={labelClass}>Ngày giờ</span>
          <input type="datetime-local" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="block">
          <span className={labelClass}>Ghi chú (không bắt buộc)</span>
          <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Khám tổng quát, đo đường huyết" />
        </label>
        <button className={`${btn} w-full`} disabled={!time || !clinicId} onClick={submit}>Đặt lịch</button>
        {msg && <p className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-dark">{msg}</p>}
      </section>
      {bookings.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold">Lịch đã đặt</h2>
          <ul className="space-y-2">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-start justify-between gap-2 rounded-2xl border border-line bg-white p-3">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">{b.clinic_name}</p>
                  <p className="text-muted">{when(b.booking_time)} · {b.patient_name}</p>
                </div>
                {b.status === "CONFIRMED" ? (
                  <button className="shrink-0 text-sm font-semibold text-danger-ink underline" onClick={() => cancelClinicBooking(b.id).then(load)}>Hủy</button>
                ) : <span className="shrink-0 text-xs text-muted">{b.status === "CANCELLED" ? "Đã hủy" : "Đã khám"}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
