import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTashqiBosish } from '../qongiroq/Filtrlar';

/**
 * Dizaynga mos ochiluvchi tanlov (select o'rniga).
 *
 * Brauzerning o'z select ro'yxati tizim uslubida chiziladi va har brauzerda
 * har xil ko'rinadi. Bu komponent ko'rinishni boshqaradi, lekin select
 * xulqini saqlaydi: ↑/↓ bilan yurish, Enter/Space bilan tanlash, Esc bilan
 * yopish, Home/End, tashqariga bosilganda yopilish; ekran o'quvchilar uchun
 * listbox/option rollari.
 */

export interface Variant {
  qiymat: string;
  nom: string;
  /** Joriy natijada nechta — o'ngda kulrang son. */
  soni?: number;
}

export function Ochiluvchi({
  belgi,
  qiymat,
  variantlar,
  onOzgar,
  hammasiNomi = 'Hammasi',
  kenglik,
  boshMatn,
}: {
  /** Tugmadagi oldingi qism: "Xizmat yo'nalishi" → "Xizmat yo'nalishi: Hammasi". */
  belgi: string;
  qiymat: string;
  variantlar: Variant[];
  onOzgar: (v: string) => void;
  hammasiNomi?: string;
  kenglik?: number;
  /** Variant yo'q bo'lganda ro'yxat ostidagi izoh (masalan, qayerdan qo'shish). */
  boshMatn?: ReactNode;
}) {
  const [ochiq, setOchiq] = useState(false);
  const [faol, setFaol] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const royxatRef = useRef<HTMLUListElement>(null);
  const id = useId();
  useTashqiBosish(ref, ochiq, () => setOchiq(false));

  const hammasi: Variant[] = [{ qiymat: '', nom: hammasiNomi }, ...variantlar];
  const tanlangan = hammasi.find((v) => v.qiymat === qiymat) ?? hammasi[0]!;

  useEffect(() => {
    if (ochiq) setFaol(Math.max(0, hammasi.findIndex((v) => v.qiymat === qiymat)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ochiq]);

  // Faol variant ko'rinib tursin (uzun ro'yxatda)
  useEffect(() => {
    if (!ochiq) return;
    royxatRef.current?.querySelector<HTMLElement>(`[data-i="${faol}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [faol, ochiq]);

  const tanla = (v: string) => {
    onOzgar(v);
    setOchiq(false);
  };

  const tugma = (e: KeyboardEvent) => {
    if (!ochiq && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setOchiq(true);
      return;
    }
    if (!ochiq) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFaol((i) => Math.min(hammasi.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFaol((i) => Math.max(0, i - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFaol(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setFaol(hammasi.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      tanla(hammasi[faol]!.qiymat);
    } else if (e.key === 'Tab') {
      setOchiq(false);
    }
  };

  return (
    <div className="och" ref={ref} style={kenglik ? { width: kenglik } : undefined}>
      <button
        type="button"
        className={`och-tugma${ochiq ? ' ochiq' : ''}${qiymat ? ' tanlangan' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={ochiq}
        aria-controls={`${id}-r`}
        aria-activedescendant={ochiq ? `${id}-${faol}` : undefined}
        onClick={() => setOchiq((v) => !v)}
        onKeyDown={tugma}
      >
        <span className="och-matn">
          {belgi}: <b>{tanlangan.nom}</b>
        </span>
        <ChevronDown className="och-strelka" aria-hidden="true" />
      </button>
      {ochiq && (
        <ul className="och-royxat" role="listbox" id={`${id}-r`} ref={royxatRef} aria-label={belgi}>
          {hammasi.map((v, i) => {
            const bu = v.qiymat === qiymat;
            return (
              <li
                key={v.qiymat || '__hammasi'}
                id={`${id}-${i}`}
                data-i={i}
                role="option"
                aria-selected={bu}
                className={`och-variant${i === faol ? ' faol' : ''}${bu ? ' tanlangan' : ''}`}
                onMouseEnter={() => setFaol(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => tanla(v.qiymat)}
              >
                <span className="och-belgi">{bu && <Check />}</span>
                <span className="och-nom">{v.nom}</span>
                {v.soni !== undefined && <span className="och-soni">{v.soni}</span>}
              </li>
            );
          })}
          {variantlar.length === 0 && <li className="och-bosh">{boshMatn ?? "Boshqa variant yo'q"}</li>}
        </ul>
      )}
    </div>
  );
}

// ─── Kichik tanlov (holat, muhimlik, forma maydonlari) ───────────────────────

/**
 * Select'ning ixcham o'rinbosari: tugmada tanlangan variant nomi, ostida
 * ro'yxat. Ochiluvchi bilan bir xil klaviatura xulqi; "Hammasi" yo'q.
 * `ton` — tanlangan variantga qarab tugma rangi (holat uchun).
 */
export function TanlovMenyu({
  qiymat,
  variantlar,
  onOzgar,
  aria,
  ton,
  kenglik,
  ochiqTepaga = false,
  disabled = false,
  id: tashqiId,
}: {
  qiymat: string;
  variantlar: Variant[];
  onOzgar: (v: string) => void;
  aria: string;
  ton?: string;
  kenglik?: number | string;
  ochiqTepaga?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  const [ochiq, setOchiq] = useState(false);
  const [faol, setFaol] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const ichkiId = useId();
  const id = tashqiId ?? ichkiId;
  useTashqiBosish(ref, ochiq, () => setOchiq(false));
  const tanlangan = variantlar.find((v) => v.qiymat === qiymat);

  useEffect(() => {
    if (ochiq) setFaol(Math.max(0, variantlar.findIndex((v) => v.qiymat === qiymat)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ochiq]);

  const tanla = (v: string) => {
    setOchiq(false);
    if (v !== qiymat) onOzgar(v);
  };
  const tugma = (e: KeyboardEvent) => {
    if (!ochiq && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      setOchiq(true);
      return;
    }
    if (!ochiq) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFaol((i) => Math.min(variantlar.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFaol((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      tanla(variantlar[faol]!.qiymat);
    } else if (e.key === 'Escape') {
      // Faqat ro'yxat yopilsin — ota oyna (dialog) Esc'ni olmasin
      e.stopPropagation();
      setOchiq(false);
    } else if (e.key === 'Tab') {
      setOchiq(false);
    }
  };

  return (
    <div className="och tm" ref={ref} style={{ width: kenglik ?? 'auto' }}>
      <button
        type="button"
        id={id}
        className={`och-tugma tm-tugma${ochiq ? ' ochiq' : ''}${ton ? ` ${ton}` : ''}`}
        aria-haspopup="listbox"
        aria-expanded={ochiq}
        aria-label={aria}
        aria-activedescendant={ochiq ? `${id}-v${faol}` : undefined}
        disabled={disabled}
        onClick={() => setOchiq((v) => !v)}
        onKeyDown={tugma}
      >
        <span className="och-matn">{tanlangan?.nom ?? '—'}</span>
        <ChevronDown className="och-strelka" aria-hidden="true" />
      </button>
      {ochiq && (
        <ul className={`och-royxat${ochiqTepaga ? ' tepaga' : ''}`} role="listbox" aria-label={aria}>
          {variantlar.map((v, i) => {
            const bu = v.qiymat === qiymat;
            return (
              <li
                key={v.qiymat}
                id={`${id}-v${i}`}
                role="option"
                aria-selected={bu}
                className={`och-variant${i === faol ? ' faol' : ''}${bu ? ' tanlangan' : ''}`}
                onMouseEnter={() => setFaol(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => tanla(v.qiymat)}
              >
                <span className="och-belgi">{bu && <Check />}</span>
                <span className="och-nom">{v.nom}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
