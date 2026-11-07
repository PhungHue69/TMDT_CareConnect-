"use client";

import { useEffect, useState } from "react";

const EVENT = "demo-notice";

/** Tells the user a navigation item has no screen yet in this demo. */
export function showDemoNotice(label: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: label }));
}

export default function DemoToast() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onNotice = (e: Event) => {
      setLabel((e as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setLabel(null), 4000);
    };
    window.addEventListener(EVENT, onNotice);
    return () => {
      window.removeEventListener(EVENT, onNotice);
      clearTimeout(timer);
    };
  }, []);

  if (!label) return null;
  return (
    <div role="status" className="fixed inset-x-4 bottom-24 z-[1300] mx-auto flex max-w-sm items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-lg sm:bottom-6">
      <span><strong>{label}</strong> — Chưa có trong bản demo.</span>
      <button type="button" onClick={() => setLabel(null)} className="shrink-0 font-semibold underline">Đóng</button>
    </div>
  );
}
