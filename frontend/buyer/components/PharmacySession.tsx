"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Pos } from "@/components/cartActions";
import type { PharmacyDetail } from "@/lib/api";

type PharmacySessionValue = {
  pos: Pos | null;
  setPos: (pos: Pos | null) => void;
  selected: PharmacyDetail | null;
  setSelected: (pharmacy: PharmacyDetail | null) => void;
  draftImage: File | null;
  setDraftImage: (file: File | null) => void;
  draftPharmacyId: number | null;
  setDraftPharmacyId: (id: number | null) => void;
};

const PharmacySessionContext = createContext<PharmacySessionValue | null>(null);

export function PharmacySessionProvider({ children }: { children: ReactNode }) {
  const [pos, setPos] = useState<Pos | null>(null);
  const [selected, setSelected] = useState<PharmacyDetail | null>(null);
  const [draftImage, setDraftImage] = useState<File | null>(null);
  const [draftPharmacyId, setDraftPharmacyId] = useState<number | null>(null);
  return (
    <PharmacySessionContext.Provider value={{ pos, setPos, selected, setSelected, draftImage, setDraftImage, draftPharmacyId, setDraftPharmacyId }}>
      {children}
    </PharmacySessionContext.Provider>
  );
}

export function usePharmacySession(): PharmacySessionValue {
  const value = useContext(PharmacySessionContext);
  if (!value) throw new Error("PharmacySessionProvider is missing");
  return value;
}
