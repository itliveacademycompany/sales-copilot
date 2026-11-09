import { MANZIL_SAHIFA } from '../sahifalar';
import { crmdami } from './IlovaAlmashtirgich';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Deal Mind ↔ CRM O'TISHI — yangi bo'lim kalit chuqurchasidan aylana bo'lib yoyiladi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * View Transitions API: brauzer eski ekranni "suratga" oladi, biz yangi
 * sahifani ochamiz va u tayyor bo'lgach yangi ekran chuqurcha markazidan
 * aylana bo'lib kengayadi, eski ekran esa biroz ichkariga cho'kadi.
 *
 * Yangi sahifa (va CRM holati) yuklanguncha "Yuklanmoqda…" ko'rinmasin
 * deb, ochilish uni kutadi — lekin ko'pi bilan KUTISH_MAX ms.
 * API yo'q brauzerda — oddiy, yumshoq paydo bo'lish.
 */

const KUTISH_MAX = 1400;
const DAVOMIYLIK = 760;
const EGRI = 'cubic-bezier(0.65, 0, 0.35, 1)';

/** Manzilga mos sahifa bo'lagini oldindan yuklaydi (eng uzun mos prefiks). */
export function bolimniOldindanYukla(manzil: string): void {
  const yol = manzil.split('?')[0] ?? manzil;
  const kalit = Object.keys(MANZIL_SAHIFA)
    .filter((k) => yol === k || (k !== '/' && yol.startsWith(`${k}/`)))
    .sort((a, b) => b.length - a.length)[0];
  if (kalit) MANZIL_SAHIFA[kalit]?.oldindanYukla();
}

/** Yangi bo'lim ochilib, yuklanish belgisi yo'qolguncha kutadi (cheklangan vaqt). */
function tayyorliginiKut(crmga: boolean): Promise<void> {
  return new Promise((tayyor) => {
    const boshi = performance.now();
    const tekshir = () => {
      const joyida = crmdami(window.location.pathname) === crmga;
      const yuklanyapti = document.querySelector('.main .yuklanmoqda');
      if ((joyida && !yuklanyapti) || performance.now() - boshi > KUTISH_MAX) tayyor();
      // rAF emas: o'tish paytida brauzer chizishni to'xtatib turadi
      else window.setTimeout(tekshir, 40);
    };
    window.setTimeout(tekshir, 0);
  });
}

export function ilovagaOt(ot: () => void, crmga: boolean, markaz: { x: number; y: number }): void {
  const html = document.documentElement;

  if (!('startViewTransition' in document)) {
    ot();
    html.classList.add('ik-kirish');
    window.setTimeout(() => html.classList.remove('ik-kirish'), 600);
    return;
  }

  html.classList.add('ik-otish');
  const otish = document.startViewTransition(async () => {
    ot();
    await tayyorliginiKut(crmga);
  });

  otish.ready
    .then(() => {
      const { x, y } = markaz;
      const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      html.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: DAVOMIYLIK, easing: EGRI, pseudoElement: '::view-transition-new(root)' },
      );
      html.animate(
        { transform: ['scale(1)', 'scale(0.965)'], filter: ['brightness(1)', 'brightness(0.86)'] },
        { duration: DAVOMIYLIK, easing: EGRI, pseudoElement: '::view-transition-old(root)' },
      );
    })
    .catch(() => undefined);

  otish.finished.catch(() => undefined).finally(() => html.classList.remove('ik-otish'));
}
