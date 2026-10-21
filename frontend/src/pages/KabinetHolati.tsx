import { ArrowLeft, CirclePause, LogOut, SearchX, ShieldOff } from 'lucide-react';
import { useAuth } from '../auth';
import { joyla, useT } from '../i18n';
import type { Kabinet } from '../kabinet';

/**
 * SaaS: subdomen bo'yicha ochilmaydigan holatlar.
 *
 *   topilmadi — `xyz.example.uz` da kabinet yo'q (xato yozilgan manzil
 *               yoki o'chirilgan mijoz). Asosiy saytga yo'l ko'rsatiladi.
 *   ruxsat    — foydalanuvchi tizimga kirgan, lekin bu kabinet xodimi emas
 *               (masalan a'zoligi olib tashlangan). Server baribir hech
 *               qanday ma'lumot bermaydi — bu ekran faqat tushuntiradi.
 *   faolsiz   — kabinetni platforma admini vaqtincha to'xtatgan. Ma'lumotlar
 *               saqlanadi; kirish faqat qayta faollashtirilgach.
 *
 * Kirish sahifasi bilan bir xil vizual til (login-fon / login-card).
 */
export function KabinetHolati({ tur, kabinet }: { tur: 'topilmadi' | 'ruxsat' | 'faolsiz'; kabinet: Kabinet }) {
  const t = useT();
  const { user, logout } = useAuth();
  const manzil = kabinet.tur === 'root' ? kabinet.rootDomain : `${kabinet.slug}.${kabinet.rootDomain}`;
  const nomi = kabinet.tur === 'tenant' || kabinet.tur === 'faolsiz' ? kabinet.name : manzil;

  return (
    <div className="login-fon">
      <div className="login-card kabinet-holat" role="alert">
        <span className={`kabinet-holat-ikon${tur === 'ruxsat' ? ' xavf' : tur === 'faolsiz' ? ' orta' : ''}`} aria-hidden="true">
          {tur === 'topilmadi' ? <SearchX /> : tur === 'faolsiz' ? <CirclePause /> : <ShieldOff />}
        </span>

        {tur === 'topilmadi' && (
          <>
            <h1 className="login-sarlavha">{t('Kabinet topilmadi')}</h1>
            <p className="kirish-izoh">
              {joyla(t("{manzil} manzilida kabinet yo'q. Manzil to'g'ri yozilganini tekshiring yoki asosiy saytga o'ting."), {
                manzil: <b>{manzil}</b>,
              })}
            </p>
          </>
        )}
        {tur === 'ruxsat' && (
          <>
            <h1 className="login-sarlavha">{t("Kirish huquqi yo'q")}</h1>
            <p className="kirish-izoh">
              {joyla(t('Siz {hisob} sifatida kirgansiz, lekin {kabinet} kabinetining xodimi emassiz.'), {
                hisob: <b>{user?.email ?? user?.login ?? user?.displayName}</b>,
                kabinet: <b>{nomi}</b>,
              })}
            </p>
          </>
        )}
        {tur === 'faolsiz' && (
          <>
            <h1 className="login-sarlavha">{t("Kabinet vaqtincha to'xtatilgan")}</h1>
            <p className="kirish-izoh">
              {joyla(t("{kabinet} kabineti administrator tomonidan vaqtincha to'xtatilgan. Ma'lumotlaringiz saqlanadi — qayta ochish uchun administratorga murojaat qiling."), {
                kabinet: <b>{nomi}</b>,
              })}
            </p>
          </>
        )}

        <div className="kabinet-holat-tugmalar">
          {tur === 'ruxsat' && (
            <button type="button" className="btn login-tugma" onClick={() => void logout()}>
              <LogOut /> {t('Boshqa hisob bilan kirish')}
            </button>
          )}
          <a href={kabinet.rootUrl} className={`btn login-tugma${tur === 'ruxsat' ? ' ikkinchi' : ''}`}>
            <ArrowLeft /> {t('Asosiy saytga')}
          </a>
        </div>
      </div>
    </div>
  );
}
