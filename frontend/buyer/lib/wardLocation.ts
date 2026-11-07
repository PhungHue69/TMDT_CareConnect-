type Ward = { ward: string; lat: number; lng: number };
type Province = { province: string; lat: number; lng: number; wards: Ward[] };

export function locationForProvince(province: Province | undefined): { lat: number; lng: number; label: string } | null {
  return province ? { lat: province.lat, lng: province.lng, label: province.province } : null;
}

export function locationForWard(province: Province | undefined, ward: string): { lat: number; lng: number; label: string } | null {
  const selected = province?.wards.find((item) => item.ward === ward);
  return selected ? { lat: selected.lat, lng: selected.lng, label: `${selected.ward}, ${province!.province}` } : null;
}
