// Small stroke icons shared by the header, search bar and mobile nav (24×24 viewBox).
type P = { className?: string };
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const HomeIcon = ({ className = "h-5 w-5" }: P) => <svg {...base} className={className}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></svg>;
export const PinIcon = ({ className = "h-5 w-5" }: P) => <svg {...base} className={className}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>;
export const OrderIcon = ({ className = "h-5 w-5" }: P) => <svg {...base} className={className}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>;
export const CartIcon = ({ className = "h-5 w-5" }: P) => <svg {...base} className={className}><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2" /><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /></svg>;
export const UserIcon = ({ className = "h-5 w-5" }: P) => <svg {...base} className={className}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>;
export const SearchIcon = ({ className = "h-5 w-5" }: P) => <svg {...base} className={className}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
export const GpsIcon = ({ className = "h-5 w-5" }: P) => <svg {...base} className={className}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>;
export const ChevronIcon = ({ className = "h-4 w-4" }: P) => <svg {...base} className={className}><path d="m6 9 6 6 6-6" /></svg>;
export const NavigateIcon = ({ className = "h-4 w-4" }: P) => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}><path d="M21 3 3 10.5l7.5 2.9L13.4 21z" /></svg>;
export const LogoMark = ({ className = "h-9 w-9" }: P) => (
  <svg viewBox="0 0 40 40" aria-hidden="true" className={className}>
    <path d="M20 35S4 25.5 4 14.5A8.5 8.5 0 0 1 20 10a8.5 8.5 0 0 1 16 4.5C36 25.5 20 35 20 35z" fill="#fff" />
    <path d="M17.5 14h5v4.5H27v5h-4.5V28h-5v-4.5H13v-5h4.5z" fill="#1A56DB" />
  </svg>
);
export const RxIcon = ({ className = "h-7 w-7" }: P) => <svg {...base} className={className}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></svg>;
export const PillIcon = ({ className = "h-7 w-7" }: P) => <svg {...base} className={className}><rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)" /><path d="m9.5 9.5 5 5" /></svg>;
export const CameraIcon = ({ className = "h-5 w-5" }: P) => <svg {...base} className={className}><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></svg>;
export const ImageIcon = ({ className = "h-5 w-5" }: P) => <svg {...base} className={className}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></svg>;
export const UploadIcon = ({ className = "h-8 w-8" }: P) => <svg {...base} className={className}><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>;
export const SendIcon = ({ className = "h-5 w-5" }: P) => <svg {...base} className={className}><path d="M21 3 10 14" /><path d="M21 3 14 21l-4-7-7-4z" /></svg>;
export const InfoIcon = ({ className = "h-5 w-5" }: P) => <svg {...base} className={className}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>;
export const CheckIcon = ({ className = "h-4 w-4" }: P) => <svg {...base} className={className}><path d="m5 12 5 5 9-10" /></svg>;
export const CloseIcon = ({ className = "h-5 w-5" }: P) => <svg {...base} className={className}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const PlusIcon = ({ className = "h-4 w-4" }: P) => <svg {...base} className={className}><path d="M12 5v14M5 12h14" /></svg>;
export const MinusIcon = ({ className = "h-4 w-4" }: P) => <svg {...base} className={className}><path d="M5 12h14" /></svg>;
export const ArrowRightIcon = ({ className = "h-5 w-5" }: P) => <svg {...base} className={className}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
export const StoreIcon = ({ className = "h-5 w-5" }: P) => <svg {...base} className={className}><path d="M4 9.5 5.5 4h13L20 9.5" /><path d="M4 9.5h16v1a3 3 0 0 1-5.3 1.9A3 3 0 0 1 12 13a3 3 0 0 1-2.7-1.6A3 3 0 0 1 4 10.5z" /><path d="M5.5 13v7h13v-7" /></svg>;
export const StarIcon = ({ className = "h-4 w-4" }: P) => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}><path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.5l-5.8 3.1 1.1-6.4L2.6 9.6l6.5-.9z" /></svg>;
