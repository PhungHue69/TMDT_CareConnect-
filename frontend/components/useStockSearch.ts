"use client";

import { useRef, useState } from "react";
import { withStock, type StockPharmacy } from "@/lib/api";
import type { Pos } from "./cartActions";

export type StockState = { key: string; list: StockPharmacy[]; error: string | null };

// Server applies limit before the client drops pharmacies with too little stock: ask for the backend max.
const STOCK_LIMIT = 100;

export const posKey = (p: Pos) => `${p.lat},${p.lng}`;

/** with-stock lookup guarded against stale responses (latest call wins; reset() cancels). */
export function useStockSearch() {
  const [state, setState] = useState<StockState | null>(null);
  const [loading, setLoading] = useState(false);
  const rid = useRef(0);

  async function run(ids: number[], pos: Pos): Promise<void> {
    const id = ++rid.current;
    setLoading(true);
    setState(null);
    let next: StockState;
    try {
      next = { key: posKey(pos), list: await withStock(pos.lat, pos.lng, ids, STOCK_LIMIT), error: null };
    } catch (e) {
      next = {
        key: posKey(pos),
        list: [],
        error: `Không tải được tồn kho nhà thuốc: ${e instanceof Error ? e.message : "lỗi không xác định"}`,
      };
    }
    if (id !== rid.current) return;
    setState(next);
    setLoading(false);
  }

  function reset() {
    rid.current++;
    setState(null);
    setLoading(false);
  }

  return { state, loading, run, reset };
}
