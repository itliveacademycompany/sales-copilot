import { X } from 'lucide-react';
import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';

/**
 * CRM modal oynasi — ilovadagi boshqa oynalar bilan bir xil uslub
 * (`vr-fon` / `vr-oyna`). Esc va fon bosilsa yopiladi, ochilganda birinchi
 * maydonga fokus tushadi, yopilganda fokus avvalgi joyiga qaytadi.
 */
export function Oyna({
  sarlavha,
  onYop,
  onSubmit,
  children,
  past,
  keng,
}: {
  sarlavha: string;
  onYop: () => void;
  onSubmit?: (e: FormEvent) => void;
  children: ReactNode;
  past?: ReactNode;
  keng?: boolean;
}) {
  const t = useT();
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const oldingi = document.activeElement as HTMLElement | null;
    const birinchi = ref.current?.querySelector<HTMLElement>('input, select, textarea, button.ci-chip');
    birinchi?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onYop();
    };
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('keydown', esc);
      oldingi?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="vr-fon" onMouseDown={(e) => e.target === e.currentTarget && onYop()}>
      <form
        ref={ref}
        className={`vr-oyna ci-oyna${keng ? ' keng' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ci-oyna-nom"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.(e);
        }}
      >
        <div className="vr-oyna-bosh">
          <h3 id="ci-oyna-nom">{sarlavha}</h3>
          <button type="button" className="vr-amal" onClick={onYop} aria-label={t('Yopish')}>
            <X />
          </button>
        </div>
        {children}
        {past && <div className="vr-oyna-past">{past}</div>}
      </form>
    </div>,
    document.body,
  );
}
