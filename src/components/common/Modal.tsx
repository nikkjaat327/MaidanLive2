import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

let openModalCount = 0;
let previousBodyOverflow = '';
const modalStack: symbol[] = [];

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  zIndexClass?: string;
  children: React.ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  maxWidthClass = 'max-w-2xl',
  zIndexClass = 'z-[80]',
  children,
}: ModalProps) {
  const titleId = useId();
  const modalTokenRef = useRef<symbol>(Symbol('modal'));
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const token = modalTokenRef.current;
    modalStack.push(token);

    if (typeof document !== 'undefined') {
      if (openModalCount === 0) {
        previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
      }
      openModalCount += 1;
    }

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === token) {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKey);

    return () => {
      window.removeEventListener('keydown', handleKey);
      const idx = modalStack.lastIndexOf(token);
      if (idx >= 0) modalStack.splice(idx, 1);

      if (typeof document !== 'undefined') {
        openModalCount = Math.max(0, openModalCount - 1);
        if (openModalCount === 0) {
          document.body.style.overflow = previousBodyOverflow;
        }
      }
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const adminTheme =
    document.querySelector('[data-admin-theme]')?.getAttribute('data-admin-theme') || null;

  return createPortal(
    <div
      data-admin-theme={adminTheme || undefined}
      className={`fixed inset-0 ${zIndexClass} flex items-end sm:items-center justify-center bg-slate-950/75 backdrop-blur-xs p-0 sm:p-4`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${maxWidthClass} max-h-[92vh] flex flex-col overflow-hidden bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl shadow-2xl`}
      >
        <div className="shrink-0 z-10 flex items-start justify-between gap-4 px-5 py-4 bg-white border-b border-slate-200">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-slate-900 truncate">
              {title}
            </h2>
            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
