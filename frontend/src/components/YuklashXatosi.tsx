import { RotateCcw, TriangleAlert } from 'lucide-react';
import { ApiError } from '../api';
import { useT } from '../i18n';

/**
 * Sahifa ma'lumoti yuklanmaganda ko'rsatiladigan holat.
 *
 * Nega kerak: ilgari ba'zi sahifalar server xatosini yutib, bo'sh ro'yxat
 * ko'rsatardi ("Hali tahlil qilingan suhbat yo'q") — rahbar "lid yo'q" deb
 * noto'g'ri xulosa chiqarardi. Boshqalari "Yuklanmoqda…" da abadiy qolardi.
 * Xato har doim xato bo'lib ko'rinishi va qayta urinish imkoni bo'lishi shart.
 */
export function YuklashXatosi({ xato, onQayta, ichki }: { xato: unknown; onQayta: () => void; /** Karta ichida — o'z kartasisiz. */ ichki?: boolean }) {
  const t = useT();
  // Faqat server qaytargan tushunarli matn; ichki JS xatolari foydalanuvchiga chiqmaydi.
  const matn = xato instanceof ApiError && xato.status > 0 ? xato.message : t("Ma'lumotni yuklab bo'lmadi");
  return (
    <div className={`${ichki ? '' : 'card '}hech-narsa yuklash-xatosi`} role="alert">
      <div className="katta-ikon">
        <TriangleAlert />
      </div>
      <b>{matn}</b>
      <span>{t("Internet ulanishini tekshirib, qayta urinib ko'ring.")}</span>
      <button type="button" className="btn ikkinchi" onClick={onQayta}>
        <RotateCcw /> {t('Qayta urinish')}
      </button>
    </div>
  );
}
