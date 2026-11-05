"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, submitPrescriptionRequest, type Pharmacy } from "@/lib/api";
import { newRequestKey } from "@/lib/requestKey";
import { CameraIcon, CheckIcon, CloseIcon, ImageIcon, InfoIcon, SendIcon, UploadIcon } from "./icons";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function PrescriptionFlow({
  pharmacy,
  file,
  onFile,
}: {
  pharmacy: Pharmacy;
  file: File | null;
  onFile: (file: File | null) => void;
}) {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const attempt = useRef<{ file: File; key: string } | null>(null);
  const cancelled = useRef(false);
  useEffect(() => {
    cancelled.current = false;
    return () => { cancelled.current = true; };
  }, []);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  function pick(next?: File) {
    setMessage(null);
    setError(null);
    if (!next) return;
    if (!TYPES.includes(next.type)) return setError("Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.");
    if (next.size > MAX_BYTES) return setError("Ảnh vượt quá 5MB.");
    attempt.current = null;
    setPreview({ file: next, url: URL.createObjectURL(next) });
    onFile(next);
  }

  async function submit() {
    if (!file || busy || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (!attempt.current || attempt.current.file !== file) attempt.current = { file, key: newRequestKey() };
      await submitPrescriptionRequest(pharmacy.id, file, attempt.current.key);
      if (cancelled.current) return;
      attempt.current = null;
      onFile(null);
      setPreview(null);
      setMessage("Gửi đơn thuốc thành công");
    } catch (e) {
      if (cancelled.current) return;
      if (e instanceof ApiError && e.status === 422) {
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : "Không gửi được ảnh. Hãy thử lại.");
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  function formatSize(bytes: number) {
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  const steps = [
    { title: "Gửi ảnh đơn thuốc", text: "Chụp hoặc tải ảnh rõ nét, đủ thông tin trên đơn." },
    { title: "Dược sĩ kiểm tra", text: "Dược sĩ xem ảnh gốc và liên hệ để xác nhận." },
    { title: "Thanh toán & nhận thuốc", text: "Bạn chỉ thanh toán khi đơn được xác nhận." },
  ];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section aria-labelledby="up-title" className="min-w-0 space-y-5 rounded-[1.25rem] border border-line bg-white p-5 sm:p-7">
        <div className="space-y-1.5">
          <h2 id="up-title" className="text-lg font-bold text-brand">Tải ảnh đơn thuốc</h2>
          <p className="text-[0.9375rem] text-muted">Vui lòng chụp rõ nét, đầy đủ thông tin đơn thuốc để dược sĩ dễ dàng kiểm tra.</p>
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (!busy) pick(e.dataTransfer.files?.[0]); }}
          className="flex flex-col items-center gap-3.5 rounded-[1.125rem] border-2 border-dashed border-[#B9C8E6] bg-[#F7FAFF] px-5 py-8 text-center sm:py-9"
        >
          {preview && preview.file === file ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt="Ảnh đơn thuốc đã chọn" className="max-h-64 max-w-full rounded-xl shadow-sm" />
          ) : (
            <span aria-hidden="true" className="flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-[#EAF1FE] text-brand"><UploadIcon /></span>
          )}
          <div className="space-y-1">
            <strong className="block text-[1.0625rem] font-semibold text-brand">
              <span className="hidden sm:inline">Kéo thả ảnh đơn thuốc vào đây</span>
              <span className="sm:hidden">Chụp hoặc chọn ảnh đơn thuốc</span>
            </strong>
            <span className="text-sm text-muted">Hỗ trợ: JPG, PNG, WebP (tối đa 5MB)</span>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <label htmlFor="rx-file" className="flex h-[2.875rem] cursor-pointer items-center gap-2 rounded-xl border border-[#D5DCE8] bg-white px-5 text-[0.9375rem] font-semibold text-brand focus-within:ring-2 focus-within:ring-brand/40 hover:bg-[#EAF1FE]">
              <ImageIcon />Chọn ảnh từ máy
              <input id="rx-file" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <label htmlFor="rx-camera" className="flex h-[2.875rem] cursor-pointer items-center gap-2 rounded-xl border border-[#D5DCE8] bg-white px-5 text-[0.9375rem] font-semibold text-brand focus-within:ring-2 focus-within:ring-brand/40 hover:bg-[#EAF1FE]">
              <CameraIcon />Chụp ảnh
              <input id="rx-camera" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" disabled={busy} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </div>
        </div>

        {file && (
          <div className="flex items-center gap-3.5 rounded-[0.875rem] border border-line bg-white px-3.5 py-3">
            <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[0.625rem] border border-line bg-[#F1F4F9] text-muted">
              {preview && preview.file === file
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={preview.url} alt="" className="h-full w-full object-cover" />
                : <ImageIcon />}
            </span>
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-[0.9375rem] font-semibold text-brand">{file.name}</strong>
              <span className="flex items-center gap-1.5 text-[0.8125rem] text-[#14713A]"><CheckIcon />Đã chọn · {formatSize(file.size)}</span>
            </div>
            <button type="button" aria-label="Xóa ảnh" disabled={busy} onClick={() => { onFile(null); setPreview(null); attempt.current = null; setError(null); }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.625rem] bg-page text-muted hover:text-ink disabled:opacity-50">
              <CloseIcon />
            </button>
          </div>
        )}

      </section>

      <aside aria-label="Gửi đơn" className="min-w-0 space-y-4">
        <div className="space-y-4 rounded-[1.25rem] border border-line bg-white p-6">
          <h2 className="text-lg font-bold text-brand">Quy trình xử lý đơn</h2>
          <ol className="space-y-4">
            {steps.map((step, i) => (
              <li key={step.title} className="flex items-start gap-3.5">
                <span aria-hidden="true" className={`flex h-[1.875rem] w-[1.875rem] shrink-0 items-center justify-center rounded-full text-sm font-bold ${i === 0 ? "bg-brand text-white" : "bg-[#EAF1FE] text-brand"}`}>{i + 1}</span>
                <span><strong className="block text-[0.9375rem] font-semibold text-brand">{step.title}</strong><span className="text-sm text-muted">{step.text}</span></span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex gap-3 rounded-2xl bg-[#EAF1FE] px-[1.125rem] py-4 text-sm leading-relaxed text-ink">
          <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <span>AI chỉ sàng lọc ảnh có phải đơn thuốc hay không; dược sĩ sẽ kiểm tra ảnh gốc. Ảnh ghi triệu chứng hoặc nhờ kê đơn sẽ bị từ chối.</span>
        </div>
        <button
          type="button"
          disabled={!file || busy}
          onClick={() => void submit()}
          aria-live="polite"
          className={`flex w-full items-center justify-center gap-2.5 rounded-2xl px-4 py-3 text-[1.0625rem] font-semibold text-white disabled:opacity-60 ${message || error ? "disabled:opacity-100" : ""} ${
            error ? "bg-[#D63A3F] hover:bg-[#B92F34]" : message ? "bg-[#14713A]" : "bg-brand shadow-[0_8px_20px_rgba(26,86,219,0.25)] hover:bg-brand-dark"
          } ${error || message ? "min-h-14 flex-col gap-0.5" : "h-14"}`}
        >
          {busy ? (
            <span className="flex items-center gap-2.5"><SendIcon />Đang kiểm tra ảnh và gửi…</span>
          ) : error ? (
            <>
              <span className="flex items-center gap-2"><CloseIcon />{error}</span>
              <span className="text-[0.8125rem] font-normal text-white/90">Chọn ảnh khác hoặc bấm để thử lại</span>
            </>
          ) : message ? (
            <>
              <span className="flex items-center gap-2"><CheckIcon className="h-5 w-5" />{message}</span>
              <span className="text-[0.8125rem] font-normal text-white/90">Bản demo: đã lưu yêu cầu; chưa chuyển tới hệ thống dược sĩ.</span>
            </>
          ) : (
            <span className="flex items-center gap-2.5"><SendIcon />Gửi đơn thuốc cho nhà thuốc</span>
          )}
        </button>
      </aside>
    </div>
  );
}
