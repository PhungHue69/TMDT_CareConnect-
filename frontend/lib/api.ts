import { buildImageUrl, type ImageKind } from "./imageUrl.ts";
import type { AddressSuggestion } from "./addressSearch.ts";

export const API = "/demo-api";

export const imageUrl = (path: string | null | undefined, kind: ImageKind): string => buildImageUrl(API, path, kind);

export type Pharmacy = {
  id: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  distance_km: number;
  image_url?: string | null;
};

export type PharmacyDetail = Omit<Pharmacy, "distance_km">;

export type DrugCategory = "RX" | "OTC" | "TPCN";

export type Drug = {
  id: number;
  name: string;
  active_ingredient: string | null;
  category: DrugCategory;
  unit: string | null;
  price: number;
  image_url: string | null;
};

export type AnalyzeItem = {
  name: string;
  dosage: string;
  quantity: number;
  matched_drug_id: number | null;
  quantity_unit?: "pack" | "unit" | "unknown";
  max_packs?: number | null;
};

export type AnalyzeResult = {
  id: number;
  status: "APPROVED" | "REJECTED_NOT_RX" | "UNREADABLE";
  input_type: "IMAGE" | "TEXT";
  items: AnalyzeItem[];
  redirect?: "DOCTOR";
  otc_hint?: boolean;
  can_unlock_rx: boolean;
  message: string;
};

export type LocationWard = { ward: string; lat: number; lng: number };
export type Location = { province: string; lat: number; lng: number; wards: LocationWard[] };

export type StockPharmacy = Pharmacy & { items: { drug_id: number; quantity: number }[] };

export type OrderBody = {
  pharmacy_id: number;
  prescription_id: number | null;
  items: { drug_id: number; quantity: number }[];
};

export type OrderResult = {
  id: number;
  total_amount: number;
  status: string;
  items: unknown[];
};

export type DrugParams = { category?: DrugCategory; q?: string };
export type InStockDrug = Drug & { stock_quantity: number };
export type PharmacyProducts = { items: InStockDrug[]; total: number; page: number; limit: number };
export type PrescriptionRequestResult = { id: number; pharmacy_id: number; status: "PENDING_PHARMACIST" };

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      const d = body?.detail;
      if (typeof d === "string") detail = d;
      else if (Array.isArray(d) && typeof d[0]?.msg === "string") detail = d[0].msg;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

export async function pharmacyDetail(id: number): Promise<PharmacyDetail> {
  return parse(await fetch(`${API}/pharmacies/${id}`));
}

export type PharmacyRating = { rating: number | null; count: number | null; url: string | null };

/** Google Maps rating; ratings are decoration, so any failure just means "no rating". */
export async function pharmacyRating(id: number): Promise<PharmacyRating> {
  try {
    return await parse<PharmacyRating>(await fetch(`${API}/pharmacies/${id}/rating`));
  } catch {
    return { rating: null, count: null, url: null };
  }
}

export async function nearby(lat: number, lng: number, limit = 20): Promise<Pharmacy[]> {
  const qs = new URLSearchParams({ lat: String(lat), lng: String(lng), limit: String(limit) });
  return parse(await fetch(`${API}/pharmacies/nearby?${qs}`));
}

export async function locations(): Promise<Location[]> {
  return parse(await fetch(`${API}/locations`));
}

export async function suggestAddresses(q: string): Promise<{ suggestions: AddressSuggestion[] }> {
  return parse(await fetch(`${API}/geocode/suggest?${new URLSearchParams({ q })}`));
}

export async function resolveAddress(placeId: string): Promise<{ lat: number; lng: number; label: string }> {
  return parse(await fetch(`${API}/geocode/resolve?${new URLSearchParams({ place_id: placeId })}`));
}

export async function withStock(lat: number, lng: number, drugIds: number[], limit = 20): Promise<StockPharmacy[]> {
  const qs = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    drug_ids: drugIds.join(","),
    limit: String(limit),
  });
  return parse(await fetch(`${API}/pharmacies/with-stock?${qs}`));
}

export async function pharmacyProducts(pharmacyId: number, q = "", page = 1, category?: "OTC" | "TPCN"): Promise<PharmacyProducts> {
  const qs = new URLSearchParams({ q, page: String(page), limit: "12" });
  if (category) qs.set("category", category);
  return parse(await fetch(`${API}/pharmacies/${pharmacyId}/products?${qs}`));
}

export async function submitPrescriptionRequest(pharmacyId: number, image: File, requestKey?: string): Promise<PrescriptionRequestResult> {
  const form = new FormData();
  form.append("pharmacy_id", String(pharmacyId));
  if (requestKey) form.append("request_key", requestKey);
  form.append("image", image);
  return parse(await fetch(`${API}/prescriptions/requests`, { method: "POST", body: form }));
}

export async function drugs(params: DrugParams = {}): Promise<Drug[]> {
  const qs = new URLSearchParams();
  if (params.category) qs.set("category", params.category);
  if (params.q) qs.set("q", params.q);
  return parse(await fetch(`${API}/drugs?${qs}`));
}

export async function analyze(form: FormData): Promise<AnalyzeResult> {
  return parse(await fetch(`${API}/prescriptions/analyze`, { method: "POST", body: form }));
}

export async function placeOrder(body: OrderBody): Promise<OrderResult> {
  return parse(
    await fetch(`${API}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}
