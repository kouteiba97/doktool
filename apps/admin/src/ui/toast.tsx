'use client';

import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';

/** One short message at the bottom of the screen. */
interface Toast {
  id: number;
  text: string;
  tone: 'default' | 'error';
}

const ToastContext = createContext<((text: string, tone?: Toast['tone']) => void) | null>(null);

const VISIBLE_MS = 4_000;

/** Short confirmations after a decision ("Dossier approuvé"), announced politely. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  const show = useCallback((text: string, tone: Toast['tone'] = 'default') => {
    const id = next.current++;
    setToasts((current) => [...current, { id, text, tone }]);
    window.setTimeout(
      () => setToasts((current) => current.filter((toast) => toast.id !== id)),
      VISIBLE_MS,
    );
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 left-1/2 z-toast flex -translate-x-1/2 flex-col items-center gap-2"
      >
        {toasts.map((toast) => (
          <div key={toast.id} className={`dt-toast${toast.tone === 'error' ? ' error' : ''}`}>
            {toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Shows a toast: `toast('Dossier approuvé')`. */
export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast outside ToastProvider');
  return show;
}
