import { Eye, EyeOff } from 'lucide-react';
import { useState, type InputHTMLAttributes, type ReactNode } from 'react';

/**
 * Ikonli input va ko'zchali parol maydoni.
 *
 * Ikkalasi ham oddiy `<input>` ning barcha atributlarini (id, value,
 * autoComplete, required…) o'zgarishsiz uzatadi — ya'ni mavjud formalarga
 * label `htmlFor` va brauzer parol menejeri buzilmasdan qo'yiladi.
 */

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

interface IkonliProps extends InputProps {
  /** Chap tomondagi ikon (bezak — ekran o'quvchiga o'qilmaydi). */
  ikon?: ReactNode;
  type?: InputHTMLAttributes<HTMLInputElement>['type'];
}

export function IkonliInput({ ikon, className, ...rest }: IkonliProps) {
  return (
    <div className={`input-qobiq${ikon ? ' ikonli' : ''}`}>
      {ikon && (
        <span className="input-ikon" aria-hidden="true">
          {ikon}
        </span>
      )}
      <input {...rest} className={`input${className ? ` ${className}` : ''}`} />
    </div>
  );
}

interface ParolProps extends InputProps {
  ikon?: ReactNode;
}

/**
 * Parol maydoni + "ko'rsatish/yashirish" tugmasi.
 *
 * Tugma `type="button"` — aks holda formaning ichida bosilganda formani
 * yuborib yuborardi. Holat `aria-pressed` orqali ekran o'quvchiga ham
 * aytiladi.
 */
export function ParolInput({ ikon, className, ...rest }: ParolProps) {
  const [korinadi, setKorinadi] = useState(false);
  const nom = korinadi ? 'Parolni yashirish' : 'Parolni ko\'rsatish';

  return (
    <div className={`input-qobiq parol${ikon ? ' ikonli' : ''}`}>
      {ikon && (
        <span className="input-ikon" aria-hidden="true">
          {ikon}
        </span>
      )}
      <input
        {...rest}
        type={korinadi ? 'text' : 'password'}
        className={`input${className ? ` ${className}` : ''}`}
      />
      <button
        type="button"
        className="kozcha"
        onClick={() => setKorinadi((v) => !v)}
        aria-label={nom}
        aria-pressed={korinadi}
        title={nom}
      >
        {korinadi ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
}
