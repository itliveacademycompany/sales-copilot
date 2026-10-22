import { ArrowRight, Columns3, GraduationCap, LayoutTemplate, PlugZap, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, ApiError } from '../../api';
import { useAuth } from '../../auth';
import { CrmKontekst, useCrm, type CrmHolat, type Seat } from '../../crm/malumot';
import { useT } from '../../i18n';
import { SAHIFA } from '../../sahifalar';
import { BitimKarta } from './BitimKarta';
import { Bitimlar } from './Bitimlar';
import { CrmSozlamalar } from './CrmSozlamalar';
import { CrmVazifalar } from './CrmVazifalar';
import { KontaktKarta, Kontaktlar } from './Kontaktlar';
import './crm-ilova.css';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CRM ILOVASI — SotuvAI yonidagi o'z CRM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tepadagi "SotuvAI | CRM" almashtirgichi shu yerga olib keladi. Holat
 * (voronkalar, maydonlar, ruxsatlar) bir marta yuklanib, kontekst orqali
 * hamma CRM sahifasiga beriladi.
 *
 * CRM hali yoqilmagan bo'lsa — shablon tanlash ekrani. Tashqi CRM
 * (amoCRM / Bitrix24) ishlatadigan biznes uchun ulash sahifasi ham shu
 * yerda: `/crm/integratsiya`.
 */
export function CrmIlova() {
  const { business } = useAuth();
  const t = useT();
  const loc = useLocation();
  const base = `/api/v1/businesses/${business!.businessId}`;
  const [holat, setHolat] = useState<CrmHolat | null>(null);
  const [seatlar, setSeatlar] = useState<Seat[]>([]);
  const [xato, setXato] = useState<string | null>(null);
  const integratsiya = business!.permissions.includes('integration:manage');

  const yangila = useCallback(async () => {
    try {
      setHolat(await api.get<CrmHolat>(`${base}/crm-app`));
      setXato(null);
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi"));
    }
  }, [base, t]);

  useEffect(() => {
    void yangila();
    void api
      .get<Seat[]>(`${base}/seats`)
      .then((s) => setSeatlar(s.filter((x) => x.isActive)))
      .catch(() => undefined);
  }, [base, yangila]);

  // Eski havola: amoCRM OAuth natijasi `/crm?ulandi=…` ga qaytardi
  const sorov = new URLSearchParams(loc.search);
  if (loc.pathname.replace(/\/$/, '') === '/crm' && (sorov.has('ulandi') || sorov.has('crm_xato'))) {
    return <Navigate to={`/crm/integratsiya${loc.search}`} replace />;
  }

  if (xato) return <div className="card xato-qator">{xato}</div>;
  if (!holat) return <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>;

  return (
    <CrmKontekst.Provider value={{ holat, base, seatlar, yangila, integratsiya }}>
      <Routes>
        <Route path="integratsiya" element={integratsiya ? <SAHIFA.crm /> : <Navigate to="/crm" replace />} />
        {holat.enabled ? (
          <>
            <Route index element={<Navigate to="bitimlar" replace />} />
            <Route path="bitimlar" element={<Bitimlar />} />
            <Route path="bitimlar/:id" element={<BitimKarta />} />
            <Route path="kontaktlar" element={<Kontaktlar />} />
            <Route path="kontaktlar/:id" element={<KontaktKarta />} />
            <Route path="vazifalar" element={<CrmVazifalar />} />
            {holat.canConfigure && <Route path="sozlamalar" element={<CrmSozlamalar />} />}
            <Route path="*" element={<Navigate to="bitimlar" replace />} />
          </>
        ) : (
          <Route path="*" element={<CrmYoqish />} />
        )}
      </Routes>
    </CrmKontekst.Provider>
  );
}

/** CRM yoqilmagan: shablon tanlash (rahbar) yoki tushuntirish (sotuvchi). */
function CrmYoqish() {
  const { holat, base, yangila, integratsiya } = useCrm();
  const t = useT();
  const [tanlov, setTanlov] = useState<'bosh' | 'talim'>('bosh');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  const yoq = async () => {
    setBand(true);
    setXato(null);
    try {
      await api.post(`${base}/crm-app/enable`, { template: tanlov });
      await yangila();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Yoqib bo‘lmadi'));
      setBand(false);
    }
  };

  return (
    <div className="ci-sahifa ci-yoqish">
      <div className="ci-yoqish-bosh">
        <span className="ci-yoqish-belgi" aria-hidden="true">
          <Columns3 />
        </span>
        <div>
          <h1>{t('SotuvAI CRM')}</h1>
          <p>
            {t("Bitimlar, kontaktlar va vazifalar — qo'ng'iroq tahlillari bilan bir joyda. Mijoz qo'ng'iroq qilsa, uning bitimida suhbat va AI bahosi o'zi paydo bo'ladi.")}
          </p>
        </div>
      </div>

      {holat.canConfigure ? (
        <section className="card ci-yoqish-karta" aria-labelledby="ci-shablon-nom">
          <h2 id="ci-shablon-nom">{t('Boshlash uchun shablon tanlang')}</h2>
          <p className="yordam">{t("Voronka, bosqich va maydonlarni keyin Sozlamalarda o'zgartirasiz.")}</p>
          <div className="ci-shablonlar" role="radiogroup" aria-labelledby="ci-shablon-nom">
            {holat.templates.map((s) => (
              <button
                type="button"
                key={s.kod}
                role="radio"
                aria-checked={tanlov === s.kod}
                className={`ci-shablon${tanlov === s.kod ? ' faol' : ''}`}
                onClick={() => setTanlov(s.kod)}
              >
                <span className="ci-shablon-ikon" aria-hidden="true">
                  {s.kod === 'talim' ? <GraduationCap /> : <LayoutTemplate />}
                </span>
                <b>{t(s.nom)}</b>
                <span>{t(s.tavsif)}</span>
                <small>
                  {t('{v} ta voronka · {m} ta maydon', { v: s.pipelines, m: s.fields })}
                </small>
              </button>
            ))}
          </div>
          {xato && (
            <div className="xato-qator" role="alert">
              {xato}
            </div>
          )}
          <button className="btn" onClick={() => void yoq()} disabled={band}>
            <Sparkles /> {band ? t('Yoqilmoqda…') : t('CRM ni yoqish')}
          </button>
        </section>
      ) : (
        <div className="card">{t('CRM hali yoqilmagan. Rahbaringiz uni yoqqach, bitimlaringiz shu yerda ko‘rinadi.')}</div>
      )}

      {integratsiya && (
        <Link to="/crm/integratsiya" className="card ci-tashqi">
          <span className="ci-tashqi-ikon" aria-hidden="true">
            <PlugZap />
          </span>
          <span className="ci-tashqi-matn">
            <b>{t('amoCRM yoki Bitrix24 ishlatasizmi?')}</b>
            <span>{t("Mavjud CRM ni ulang — SotuvAI tahlillarni o'sha yerga yozadi.")}</span>
          </span>
          <ArrowRight aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
