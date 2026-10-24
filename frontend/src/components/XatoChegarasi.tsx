import { RotateCcw, TriangleAlert } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { tarjima } from '../i18n';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * XATO CHEGARASI (ErrorBoundary)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Busiz bitta komponentdagi render xatosi BUTUN ilovani o'chirib yuborardi:
 * foydalanuvchi oq ekran ko'rardi, menyu ham, chiqish tugmasi ham yo'qolardi.
 * Chegara xatoni shu joyda ushlaydi va tushunarli ekran ko'rsatadi.
 *
 * Ikki joyda turadi:
 *   - ildizda (`main.tsx`, `toliq`) — oxirgi himoya;
 *   - Layout ichida, sahifa atrofida — menyu ishlashda davom etadi,
 *     boshqa bo'limga o'tilsa chegara o'zi tiklanadi (`kalit`).
 *
 * Deploy'dan keyin eski JS bo'lagi topilmasa (har push = deploy), bu
 * xato emas — sayt yangilangan. Bunday holatda sahifa bir marta o'zi
 * yangilanadi (`eskiBolakmi`), keyingi marta esa ekran chiqadi — cheksiz
 * qayta yuklanish halqasi bo'lmasin.
 */

const BOLAK_XATOSI = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError|Loading chunk \S+ failed/i;
const YANGILASH_KALIT = 'sotuvai-bolak-yangilandi';

export function eskiBolakmi(xato: unknown): boolean {
  const matn = xato instanceof Error ? `${xato.name} ${xato.message}` : String(xato);
  return BOLAK_XATOSI.test(matn);
}

/**
 * Sahifani yangilaydi — 30 soniya ichida ikkinchi marta emas. Yangilangan
 * bo'lsa `true` (chaqiruvchi ekran ko'rsatmasin), aks holda `false`.
 */
export function birMartaYangila(): boolean {
  try {
    const oldingi = Number(sessionStorage.getItem(YANGILASH_KALIT) ?? 0);
    if (Date.now() - oldingi < 30_000) return false;
    sessionStorage.setItem(YANGILASH_KALIT, String(Date.now()));
  } catch {
    // sessionStorage yopiq — halqa xavfi bor, shuning uchun yangilamaymiz.
    return false;
  }
  window.location.reload();
  return true;
}

interface Props {
  children: ReactNode;
  /** O'zgarsa — chegara tiklanadi (masalan sahifa manzili). */
  kalit?: string;
  /** Butun ekran ko'rinishi (ildiz chegarasi uchun). */
  toliq?: boolean;
}

interface Holat {
  xato: Error | null;
  yangilanmoqda: boolean;
}

export class XatoChegarasi extends Component<Props, Holat> {
  state: Holat = { xato: null, yangilanmoqda: false };

  static getDerivedStateFromError(xato: Error): Partial<Holat> {
    return { xato };
  }

  componentDidCatch(xato: Error, info: ErrorInfo): void {
    console.error('XatoChegarasi:', xato, info.componentStack);
    if (eskiBolakmi(xato) && birMartaYangila()) this.setState({ yangilanmoqda: true });
  }

  componentDidUpdate(oldingi: Props): void {
    if (this.state.xato && oldingi.kalit !== this.props.kalit) this.setState({ xato: null });
  }

  render(): ReactNode {
    const { xato, yangilanmoqda } = this.state;
    if (!xato) return this.props.children;
    if (yangilanmoqda) return <div className="yuklanmoqda">{tarjima('Yuklanmoqda…')}</div>;

    const bolak = eskiBolakmi(xato);
    return (
      <div className={`xato-chegara${this.props.toliq ? ' toliq' : ''}`} role="alert">
        <div className="card hech-narsa">
          <div className="katta-ikon">
            <TriangleAlert />
          </div>
          <b>{bolak ? tarjima('Sayt yangilandi') : tarjima("Bu qismni ko'rsatib bo'lmadi")}</b>
          <span>
            {bolak
              ? tarjima('Yangi versiyani ochish uchun sahifani yangilang.')
              : tarjima("Kutilmagan xato yuz berdi. Qayta urinib ko'ring — muammo takrorlansa, administratorga xabar bering.")}
          </span>
          <div className="xato-chegara-tugmalar">
            {!bolak && (
              <button type="button" className="btn ikkinchi" onClick={() => this.setState({ xato: null })}>
                {tarjima('Qayta urinish')}
              </button>
            )}
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              <RotateCcw /> {tarjima('Sahifani yangilash')}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
