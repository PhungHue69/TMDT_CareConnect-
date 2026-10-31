"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Pharmacy } from "@/lib/api";
import { baseMap } from "@/lib/mapTiles";

const PIN_PATH = "M18 1C8.6 1 1 8.6 1 18c0 12.4 17 25 17 25s17-12.6 17-25C35 8.6 27.4 1 18 1z";
// Teardrop pin with a white cross, matching the reference design; divIcon avoids Leaflet's broken default image URLs.
const pin = (color: string, size: number) => L.divIcon({
  className: "",
  html: `<svg width="${size}" height="${Math.round(size * 44 / 36)}" viewBox="0 0 36 44" style="filter:drop-shadow(0 2px 3px rgba(15,30,61,.35))"><path d="${PIN_PATH}" fill="${color}" stroke="#fff" stroke-width="2"/><path d="M15.5 10h5v5.5H26v5h-5.5V26h-5v-5.5H10v-5h5.5z" fill="#fff"/></svg>`,
  iconSize: [size, Math.round(size * 44 / 36)],
  iconAnchor: [size / 2, Math.round(size * 44 / 36)],
  popupAnchor: [0, -Math.round(size * 44 / 36) + 4],
});
const userIcon = L.divIcon({
  className: "",
  html: '<div style="width:16px;height:16px;border-radius:50%;background:#1A56DB;border:3px solid #fff;box-shadow:0 0 0 6px rgba(26,86,219,.22)"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});
const pharmacyIcon = pin("#1A56DB", 30);
const chosenIcon = pin("#D63A3F", 38);

export default function PharmacyMap({
  user, pharmacies, chosenId, onChoose, onHighlight, className = "h-72 w-full",
}: {
  user: { lat: number; lng: number } | null;
  pharmacies: Pharmacy[];
  chosenId?: number;
  onChoose?: (pharmacy: Pharmacy) => void;
  onHighlight?: (id: number) => void;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const byId = useRef(new Map<number, L.Marker>());
  const lastFitKey = useRef("");
  const userRef = useRef(user);

  // Effects re-run when Next restores an Activity-hidden page; Leaflet needs a new map on the same div.
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const instance = L.map(element, { zoomControl: false }).setView([16.2, 106.3], 6);
    L.tileLayer(baseMap.url, { attribution: baseMap.attribution }).addTo(instance);
    L.control.zoom({ position: "topright", zoomInTitle: "Phóng to", zoomOutTitle: "Thu nhỏ" }).addTo(instance);
    const Locate = L.Control.extend({
      onAdd() {
        const button = L.DomUtil.create("button", "leaflet-bar tgb-locate");
        button.type = "button";
        button.title = "Về vị trí của bạn";
        button.setAttribute("aria-label", "Về vị trí của bạn");
        button.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
        L.DomEvent.disableClickPropagation(button);
        L.DomEvent.on(button, "click", () => {
          const u = userRef.current;
          if (u) instance.setView([u.lat, u.lng], Math.max(instance.getZoom(), 15));
        });
        return button;
      },
    });
    new Locate({ position: "topright" }).addTo(instance);
    const layer = L.layerGroup().addTo(instance);
    map.current = instance;
    markers.current = layer;
    lastFitKey.current = "";
    return () => {
      map.current = null;
      markers.current = null;
      instance.remove();
    };
  }, []);

  useEffect(() => {
    userRef.current = user;
    const instance = map.current;
    const layer = markers.current;
    if (!instance || !layer) return;
    layer.clearLayers();
    byId.current.clear();
    if (!user) {
      if (lastFitKey.current !== "overview") instance.setView([16.2, 106.3], 6);
      lastFitKey.current = "overview";
      return;
    }
    const points: L.LatLngTuple[] = [[user.lat, user.lng]];
    L.marker([user.lat, user.lng], { icon: userIcon, zIndexOffset: -100 }).bindPopup("Vị trí của bạn").addTo(layer);
    for (const pharmacy of pharmacies) {
      const point: L.LatLngTuple = [pharmacy.latitude, pharmacy.longitude];
      points.push(point);
      const popup = document.createElement("div");
      popup.className = "tgb-popup";
      const title = document.createElement("strong");
      title.textContent = pharmacy.name;
      const distance = document.createElement("span");
      distance.textContent = `Cách ${pharmacy.distance_km.toFixed(1)} km`;
      popup.append(title, distance);
      if (onChoose) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Chọn nhà thuốc này";
        button.addEventListener("click", () => onChoose(pharmacy));
        popup.append(button);
      }
      const chosen = pharmacy.id === chosenId;
      const marker = L.marker(point, { icon: chosen ? chosenIcon : pharmacyIcon, zIndexOffset: chosen ? 1000 : 0 })
        .bindPopup(popup, { closeButton: false, className: "tgb-popup-wrap" })
        .addTo(layer);
      marker.on("click", () => onHighlight?.(pharmacy.id));
      byId.current.set(pharmacy.id, marker);
    }
    const fitKey = `${user.lat},${user.lng}:${pharmacies.map((p) => p.id).join(",")}`;
    if (fitKey !== lastFitKey.current) {
      // nearby() is sorted by distance; framing the user plus the closest few keeps the street-level view.
      if (points.length > 1) instance.fitBounds(L.latLngBounds(points.slice(0, 4)), { padding: [50, 50], maxZoom: 16 });
      else instance.setView([user.lat, user.lng], 15);
      lastFitKey.current = fitKey;
    }
    instance.invalidateSize();
  }, [user, pharmacies, chosenId, onChoose, onHighlight]);

  // Opening the popup for the highlighted pharmacy keeps list and map in step.
  useEffect(() => {
    if (chosenId === undefined) return;
    const marker = byId.current.get(chosenId);
    if (marker && map.current) {
      marker.openPopup();
      map.current.panTo(marker.getLatLng());
    }
  }, [chosenId, pharmacies]);

  return (
    <div className={`relative overflow-hidden rounded-[1.25rem] border border-line bg-[#EEF1F5] ${className}`}>
      <div ref={container} className="absolute inset-0" aria-label="Bản đồ nhà thuốc gần bạn" />
      <div className="pointer-events-none absolute bottom-7 left-2 z-[500] flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-white px-3 py-2 text-xs text-ink shadow-md sm:bottom-8 sm:left-4 sm:text-[0.8125rem]">
        <span className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3 rounded-full bg-brand shadow-[0_0_0_3px_#D3E0FA]" />Vị trí của bạn</span>
        <span className="flex items-center gap-1.5"><svg aria-hidden="true" width="12" height="15" viewBox="0 0 36 44"><path d={PIN_PATH} fill="#1A56DB" /></svg>Nhà thuốc</span>
        <span className="flex items-center gap-1.5"><svg aria-hidden="true" width="12" height="15" viewBox="0 0 36 44"><path d={PIN_PATH} fill="#D63A3F" /></svg>Đang chọn</span>
      </div>
    </div>
  );
}
