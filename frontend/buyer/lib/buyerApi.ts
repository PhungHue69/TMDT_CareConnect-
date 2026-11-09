// Self-contained (no imports) so it runs under `node --experimental-strip-types`.
// Giao dịch của người mua (đơn hàng, đơn thuốc, khám bác sĩ, phòng khám) đi qua API Node `/api/buyer`
// và ghi vào PostgreSQL chung với Nhà thuốc, Bác sĩ, Family Care.
// Đăng nhập dùng chung với Family Care: cùng địa chỉ nên đọc được token mà trang đăng nhập đã lưu.

export const BUYER_API = "/api";
const TOKEN_KEY = "cc_token";

export class BuyerApiError extends Error {
  readonly status: number;
  readonly redirect?: string;

  constructor(message: string, status: number, redirect?: string) {
    super(message);
    this.status = status;
    this.redirect = redirect;
  }
}

/** Token của tab hiện tại (Family Care lưu theo tab), hoặc lần đăng nhập gần nhất. */
export function getToken(): string | null {
  for (const store of [globalThis.sessionStorage, globalThis.localStorage]) {
    try {
      const value = store?.getItem(TOKEN_KEY);
      if (value) return value;
    } catch {
      // bộ nhớ trình duyệt bị chặn
    }
  }
  return null;
}

/** Trang đăng nhập dùng chung; quay lại đúng trang đang xem sau khi đăng nhập. */
export function loginUrl(nextPath: string): string {
  return `/buyer-family/login.html?next=${encodeURIComponent(nextPath)}`;
}

export async function buyerFetch<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  if (!token) throw new BuyerApiError("Vui lòng đăng nhập để tiếp tục", 401);
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${BUYER_API}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new BuyerApiError("Không kết nối được máy chủ CareConnect", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new BuyerApiError(data.error || `HTTP ${res.status}`, res.status, data.redirect);
  return data as T;
}

export type Person = { id: number; full_name: string; phone: string; relationship: string | null };
export type Address = {
  id: number;
  user_id: number;
  label: string | null;
  recipient_name: string;
  recipient_phone: string;
  address_line: string;
  latitude: number;
  longitude: number;
  is_default: boolean;
};
export type BuyerContext = { people: Person[]; addresses: Address[] };

export type PaymentGateway = "MOMO" | "VNPAY" | "ZALOPAY" | "VIETQR" | "COD";
export const PAYMENT_OPTIONS: { value: PaymentGateway; label: string }[] = [
  { value: "MOMO", label: "Ví MoMo" },
  { value: "VNPAY", label: "VNPay" },
  { value: "ZALOPAY", label: "ZaloPay" },
  { value: "VIETQR", label: "Chuyển khoản VietQR" },
  { value: "COD", label: "Tiền mặt khi nhận hàng" },
];

export type OrderLine = { name: string; quantity: number; unit_price: number; product_type: string };
export type BuyerOrder = {
  id: number;
  order_code: string;
  status: string;
  payment_method: string;
  payment_status: string;
  subtotal_amount: number;
  shipping_fee: number;
  total_amount: number;
  created_at: string;
  shipping_address_line: string;
  shipping_recipient_name: string;
  cancel_reason: string | null;
  buyer_user_id: number;
  recipient_user_id: number;
  pharmacy_name: string;
  pharmacy_phone: string | null;
  buyer_name: string;
  recipient_name: string;
  driver_name: string | null;
  driver_phone: string | null;
  items: OrderLine[] | null;
  distance_km?: number;
};

export type QuoteLine = { name: string; quantity: number; unit_price: number; is_substitute: boolean; note: string | null; available: boolean };
export type RxRequest = {
  id: number;
  status: "SENT" | "QUOTED" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CANCELLED";
  quoted_subtotal: number | null;
  pharmacist_note: string | null;
  reject_reason: string | null;
  expires_at: string | null;
  created_at: string;
  pharmacy_name: string;
  source: string;
  patient_user_id: number;
  patient_name: string;
  order_code: string | null;
  prescribed: { name: string; dosage: string | null; quantity: number }[] | null;
  quote: QuoteLine[] | null;
};

export type Doctor = {
  id: number;
  full_name: string;
  specialty: string | null;
  workplace: string | null;
  years_of_experience: number | null;
  bio: string | null;
  consultation_fee: number;
  consultation_modes: ("CHAT" | "AUDIO" | "VIDEO")[];
  is_online: boolean;
  rating: number | null;
  rating_count: number;
};

export type RxItem = { name: string; dosage: string | null; quantity: number; usage?: string | null };
export type Consultation = {
  id: number;
  mode: string;
  status: "WAITING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  fee_amount: number;
  payment_status: string;
  symptom_description: string | null;
  diagnosis: string | null;
  created_at: string;
  patient_user_id: number;
  patient_name: string;
  doctor_name: string;
  specialty: string | null;
  prescription_id: number | null;
  valid_until: string | null;
  items: RxItem[] | null;
};

export type RxPharmacy = { id: number; name: string; address: string; distance_km: number; in_stock: number; total_items: number };
export type Clinic = { id: number; name: string; address: string; phone: string | null; doctors: { name: string; specialty: string | null }[] | null };
export type ClinicBooking = { id: number; booking_time: string; status: string; symptom_note: string | null; clinic_name: string; address: string; patient_name: string };

export const buyerContext = () => buyerFetch<BuyerContext>("/buyer/context");

export const createOrder = (body: {
  pharmacy_ref: number;
  items: { drug_ref: number; quantity: number }[];
  recipient_user_id: number;
  address_id: number;
  payment_gateway: PaymentGateway;
  note?: string;
}) => buyerFetch<{ order: BuyerOrder }>("/buyer/orders", { method: "POST", body });

export const myOrders = () => buyerFetch<{ orders: BuyerOrder[] }>("/buyer/orders");
export const cancelOrder = (id: number) => buyerFetch<{ ok: true }>(`/buyer/orders/${id}/cancel`, { method: "POST" });

export const sendPrescriptionImage = (body: { pharmacy_ref: number; patient_user_id: number; image_data_url: string }) =>
  buyerFetch<{ request: RxRequest; pharmacy_name: string }>("/buyer/prescription-requests", { method: "POST", body });

export const sendEPrescription = (body: { pharmacy_id: number; prescription_id: number }) =>
  buyerFetch<{ request: RxRequest; pharmacy_name: string }>("/buyer/prescription-requests", { method: "POST", body });

export const myRequests = () => buyerFetch<{ requests: RxRequest[] }>("/buyer/prescription-requests");
export const acceptQuote = (id: number, body: { address_id: number; payment_gateway: PaymentGateway }) =>
  buyerFetch<{ order: BuyerOrder }>(`/buyer/prescription-requests/${id}/accept`, { method: "POST", body });
export const cancelRequest = (id: number) => buyerFetch<{ ok: true }>(`/buyer/prescription-requests/${id}/cancel`, { method: "POST" });

export const doctors = (q = "") => buyerFetch<{ doctors: Doctor[] }>(`/buyer/doctors?${new URLSearchParams({ q })}`);
export const bookConsultation = (body: {
  doctor_profile_id: number;
  patient_user_id: number;
  mode: string;
  symptom_description: string;
  payment_gateway: PaymentGateway;
}) => buyerFetch<{ consultation: Consultation; doctor_name: string }>("/buyer/consultations", { method: "POST", body });
export const myConsultations = () => buyerFetch<{ consultations: Consultation[] }>("/buyer/consultations");
export const cancelConsultation = (id: number) => buyerFetch<{ ok: true }>(`/buyer/consultations/${id}/cancel`, { method: "POST" });
export const rxPharmacies = (prescriptionId: number, lat: number, lng: number) =>
  buyerFetch<{ pharmacies: RxPharmacy[] }>(`/buyer/prescriptions/${prescriptionId}/pharmacies?${new URLSearchParams({ lat: String(lat), lng: String(lng) })}`);

export const clinics = () => buyerFetch<{ clinics: Clinic[] }>("/buyer/clinics");
export const bookClinic = (body: { clinic_id: number; patient_user_id: number; booking_time: string; symptom_note?: string }) =>
  buyerFetch<{ booking: ClinicBooking; clinic_name: string }>("/buyer/clinic-bookings", { method: "POST", body });
export const myClinicBookings = () => buyerFetch<{ bookings: ClinicBooking[] }>("/buyer/clinic-bookings");
export const cancelClinicBooking = (id: number) => buyerFetch<{ ok: true }>(`/buyer/clinic-bookings/${id}/cancel`, { method: "POST" });

/** Tên hiển thị khi chọn người nhận / người bệnh. */
export function personLabel(p: Person, meId: number): string {
  return p.id === meId ? `Bản thân (${p.full_name})` : `${p.relationship || "Người thân"} · ${p.full_name}`;
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Không đọc được ảnh"));
    reader.readAsDataURL(file);
  });
}
