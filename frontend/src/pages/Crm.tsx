import { CircleCheck, ExternalLink, KeyRound, RefreshCw, TriangleAlert, Unplug, Webhook } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, fmtSana } from '../api';
import { useAuth } from '../auth';
import { joyla, useT } from '../i18n';
import './crm.css';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CRM — CRM tizimini ulash
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Hozircha amoCRM: uzoq muddatli token bilan ulanadi, server uni amoCRM da
 * tekshiradi va shifrlab saqlaydi. Ulangandan keyin hisob tuzilishi
 * (voronkalar, bosqichlar, foydalanuvchilar) jonli ko'rsatiladi — ulanish
 * haqiqatan ishlayotganining isboti. amoCRM ga hech narsa yozilmaydi.
 *
 * Token hech qachon qaytarilmaydi: sahifa faqat niqobini ko'radi.
 */

interface AmoHolat {
  connected: boolean;
  status: 'connected' | 'error' | 'disconnected' | 'paused';
  account: {
    id: number | null;
    name: string;
    subdomain: string;
    baseDomain: string;
    url: string;
    country: string | null;
    currency: string | null;
    connectedAt: string | null;
  } | null;
  lastAddress: string | null;
  tokenHint: string | null;
  tokenExpiresAt: string | null;
  lastCheckAt: string | null;
  lastError: string | null;
}

interface AmoTuzilish {
  pipelines: {
    id: number;
    name: string;
    isMain: boolean;
    statuses: { id: number; name: string; tur: 'ochiq' | 'muvaffaqiyat' | 'yopilgan' }[];
  }[];
  users: { id: number; name: string; isAdmin: boolean; isActive: boolean }[];
  leadFieldCount: number;
}

const KUN = 86_400_000;

export function Crm() {
  const t = useT();
  return (
    <div className="crm-sahifa">
      <div className="crm-bosh">
        <h1>{t('CRM')}</h1>
        <p>{t("CRM tizimingizni ulang — SotuvAI sdelkalar, voronkalar va menejerlarni ko'radi.")}</p>
      </div>

      <AmoCrm />

      <div className="crm-boshqa">
        <div className="card crm-kichik">
          <span className="crm-logo bitrix" aria-hidden="true">B24</span>
          <div>
            <div className="crm-kichik-nom">
              Bitrix24 <span className="badge kul">{t('Tez orada')}</span>
            </div>
            <div className="yordam">{t("Bitrix24 bilan to'g'ridan-to'g'ri ulanish keyingi bosqichda qo'shiladi.")}</div>
          </div>
        </div>
        <div className="card crm-kichik">
          <span className="crm-logo boshqa" aria-hidden="true">
            <Webhook />
          </span>
          <div>
            <div className="crm-kichik-nom">{t('Boshqa CRM')}</div>
            <div className="yordam">
              {joyla(t('Istalgan CRM ga vazifalarni imzolangan webhook orqali yuborish mumkin: {havola}.'), {
                havola: <Link to="/sozlamalar?b=crmEksport">{t('Sozlamalar → Vazifalarni CRM ga yuborish')}</Link>,
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── amoCRM ──────────────────────────────────────────────────────────────────

function AmoCrm() {
  const t = useT();
  const { business } = useAuth();
  const businessId = business?.businessId;
  const base = `/api/v1/businesses/${businessId}/integrations/amocrm`;

  const [h, setH] = useState<AmoHolat | null>(null);
  const [yuklashXato, setYuklashXato] = useState<string | null>(null);
  const [manzil, setManzil] = useState('');
  const [token, setToken] = useState('');
  const [formaOchiq, setFormaOchiq] = useState(false);
  const [band, setBand] = useState<'ulash' | 'tekshir' | 'uzish' | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [xabar, setXabar] = useState<string | null>(null);
  const [tuzilish, setTuzilish] = useState<AmoTuzilish | null>(null);
  const [tuzilishXato, setTuzilishXato] = useState<string | null>(null);

  const yukla = useCallback(async () => {
    try {
      const r = await api.get<AmoHolat>(base);
      setH(r);
      setYuklashXato(null);
      if (r.lastAddress) setManzil((eski) => eski || r.lastAddress!);
      return r;
    } catch (e) {
      setYuklashXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi"));
      return null;
    }
  }, [base, t]);

  const tuzilishniYukla = useCallback(async () => {
    setTuzilishXato(null);
    try {
      setTuzilish(await api.get<AmoTuzilish>(`${base}/structure`));
    } catch (e) {
      setTuzilish(null);
      setTuzilishXato(e instanceof ApiError ? t(e.message) : t("amoCRM ma'lumotini olib bo'lmadi"));
    }
  }, [base, t]);

  useEffect(() => {
    void yukla().then((r) => {
      if (r?.connected) void tuzilishniYukla();
    });
  }, [yukla, tuzilishniYukla]);

  if (yuklashXato) return <div className="card xato-qator">{yuklashXato}</div>;
  if (!h) return <div className="card yuklanmoqda">{t('Yuklanmoqda…')}</div>;

  const ulangan = h.connected;
  const buzilgan = ulangan && h.status === 'error';
  const muddatKun = h.tokenExpiresAt ? Math.ceil((new Date(h.tokenExpiresAt).getTime() - Date.now()) / KUN) : null;
  const formaKorinadi = !ulangan || formaOchiq;

  const ulash = async (e: FormEvent) => {
    e.preventDefault();
    setBand('ulash');
    setXato(null);
    setXabar(null);
    try {
      const r = await api.put<{ account: { name: string } }>(base, {
        address: manzil.trim(),
        token: token.trim() ? token.trim() : null,
      });
      setToken('');
      setFormaOchiq(false);
      setXabar(t('{nom} hisobi ulandi', { nom: r.account.name }));
      await yukla();
      await tuzilishniYukla();
    } catch (err) {
      setXato(err instanceof ApiError ? t(err.message) : t("Ulab bo'lmadi"));
    } finally {
      setBand(null);
    }
  };

  const tekshir = async () => {
    setBand('tekshir');
    setXato(null);
    setXabar(null);
    try {
      const r = await api.post<{ ok: boolean; error?: string }>(`${base}/check`);
      if (r.ok) {
        setXabar(t('Ulanish ishlayapti'));
        await tuzilishniYukla();
      } else setXato(r.error ? t(r.error) : t('Ulanishda xato'));
      await yukla();
    } catch (err) {
      setXato(err instanceof ApiError ? t(err.message) : t('Ulanishda xato'));
    } finally {
      setBand(null);
    }
  };

  const uzish = async () => {
    if (!window.confirm(t("amoCRM uzilsinmi? Token o'chiriladi, amoCRM dagi ma'lumotlarga tegilmaydi."))) return;
    setBand('uzish');
    setXato(null);
    setXabar(null);
    try {
      await api.del(base);
      setTuzilish(null);
      setFormaOchiq(false);
      await yukla();
    } catch (err) {
      setXato(err instanceof ApiError ? t(err.message) : t("Uzib bo'lmadi"));
    } finally {
      setBand(null);
    }
  };

  return (
    <section className="card crm-amo" aria-labelledby="crm-amo-nom">
      <div className="crm-amo-bosh">
        <span className="crm-logo amo" aria-hidden="true">amo</span>
        <div className="crm-amo-sarlavha">
          <h2 id="crm-amo-nom">amoCRM</h2>
          <span className="yordam">{t("Sdelkalar, kontaktlar va qo'ng'iroqlar")}</span>
        </div>
        <span className={`badge ${buzilgan ? 'qizil' : ulangan ? 'ok' : 'kul'}`}>
          {buzilgan ? t('xato') : ulangan ? t('ulangan') : t('ulanmagan')}
        </span>
      </div>

      {/* ─── Ulangan hisob ─── */}
      {ulangan && h.account && (
        <>
          {buzilgan && h.lastError && (
            <div className="crm-ogoh past" role="alert">
              <TriangleAlert aria-hidden="true" />
              <span>
                {t(h.lastError)}. {t('Yangi token kiriting yoki ulanishni qayta tekshiring.')}
              </span>
            </div>
          )}
          {!buzilgan && muddatKun !== null && muddatKun <= 30 && (
            <div className="crm-ogoh orta" role="status">
              <TriangleAlert aria-hidden="true" />
              <span>
                {muddatKun <= 0
                  ? t('Token muddati tugagan — amoCRM da yangisini yarating.')
                  : t('Token {n} kundan keyin tugaydi — oldindan yangisini yarating.', { n: muddatKun })}
              </span>
            </div>
          )}

          <dl className="crm-malumot">
            <div>
              <dt>{t('Hisob')}</dt>
              <dd>
                <a href={h.account.url} target="_blank" rel="noopener noreferrer" className="crm-havola">
                  {h.account.name} <ExternalLink aria-hidden="true" />
                </a>
              </dd>
            </div>
            <div>
              <dt>{t('Manzil')}</dt>
              <dd>
                {h.account.subdomain}.{h.account.baseDomain}
              </dd>
            </div>
            <div>
              <dt>{t('Token')}</dt>
              <dd>
                <code>{h.tokenHint}</code>
                {h.tokenExpiresAt && (
                  <span className="crm-izoh"> · {t('{sana} gacha', { sana: fmtSana(h.tokenExpiresAt) })}</span>
                )}
              </dd>
            </div>
            <div>
              <dt>{t('Oxirgi tekshiruv')}</dt>
              <dd>{h.lastCheckAt ? fmtSana(h.lastCheckAt) : t("hali bo'lmagan")}</dd>
            </div>
          </dl>

          <div className="crm-tugmalar">
            <button type="button" className="btn ikkinchi" disabled={band !== null} onClick={() => void tekshir()}>
              <RefreshCw aria-hidden="true" className={band === 'tekshir' ? 'aylan' : undefined} />
              {band === 'tekshir' ? t('Tekshirilmoqda…') : t('Ulanishni tekshirish')}
            </button>
            <button
              type="button"
              className="btn ikkinchi"
              disabled={band !== null}
              aria-expanded={formaOchiq}
              onClick={() => setFormaOchiq((v) => !v)}
            >
              <KeyRound aria-hidden="true" />
              {t('Tokenni almashtirish')}
            </button>
            <button type="button" className="btn ikkinchi crm-uzish" disabled={band !== null} onClick={() => void uzish()}>
              <Unplug aria-hidden="true" />
              {band === 'uzish' ? t('Uzilmoqda…') : t('Uzish')}
            </button>
          </div>
        </>
      )}

      {xabar && (
        <div className="ok-qator" role="status">
          <CircleCheck aria-hidden="true" /> {xabar}
        </div>
      )}
      {xato && (
        <div className="xato-qator" role="alert">
          {xato}
        </div>
      )}

      {/* ─── Ulash formasi ─── */}
      {formaKorinadi && (
        <form className="crm-forma" onSubmit={(e) => void ulash(e)}>
          {!ulangan && (
            <p className="yordam">
              {t("amoCRM hisobingizni uzoq muddatli token bilan ulang. Token shifrlangan holda saqlanadi va keyin hech qachon to'liq ko'rsatilmaydi.")}
            </p>
          )}

          <details className="crm-qollanma" open={!ulangan}>
            <summary>{t('Tokenni qayerdan olaman?')}</summary>
            <ol>
              <li>{joyla(t('amoCRM da {yol} oching.'), { yol: <b>amoМаркет → «⋯» → «Создать интеграцию»</b> })}</li>
              <li>{t('Integratsiyaga nom bering (masalan «SotuvAI») va hisob maʼlumotlariga kirish ruxsatini belgilang.')}</li>
              <li>{joyla(t('Saqlang, so‘ng {tab} bo‘limida {token} yarating.'), { tab: <b>«Ключи и доступы»</b>, token: <b>«Долгосрочный токен»</b> })}</li>
              <li>{t('Muddatini tanlang (uzoqroq — qulayroq), tokenni nusxalab shu yerga qo‘ying.')}</li>
            </ol>
            <p className="yordam">{t('Tokenni hech kimga, jumladan chatga yubormang — faqat shu maydonga kiriting.')}</p>
          </details>

          <div className="maydon-blok">
            <label htmlFor="amo-manzil">{t('Hisob manzili')}</label>
            <input
              id="amo-manzil"
              value={manzil}
              placeholder="kompaniya.amocrm.ru"
              autoComplete="off"
              spellCheck={false}
              maxLength={300}
              required
              onChange={(e) => setManzil(e.target.value)}
            />
            <div className="yordam">{t('Brauzerdagi amoCRM manzilini nusxalab qo‘yishingiz mumkin.')}</div>
          </div>
          <div className="maydon-blok">
            <label htmlFor="amo-token">{t('Uzoq muddatli token')}</label>
            <input
              id="amo-token"
              type="password"
              value={token}
              placeholder={h.tokenHint ?? 'eyJ0eXAiOiJKV1Qi…'}
              autoComplete="off"
              spellCheck={false}
              maxLength={4000}
              required={!ulangan}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>

          <div className="crm-tugmalar">
            <button type="submit" className="btn" disabled={band !== null || !manzil.trim() || (!ulangan && !token.trim())}>
              {band === 'ulash' ? t('Tekshirilmoqda…') : ulangan ? t('Saqlash va tekshirish') : t('Ulash')}
            </button>
            {ulangan && (
              <button type="button" className="btn ikkinchi" onClick={() => setFormaOchiq(false)}>
                {t('Bekor qilish')}
              </button>
            )}
          </div>
        </form>
      )}

      {/* ─── Hisob tuzilishi ─── */}
      {ulangan && !buzilgan && (
        <div className="crm-tuzilish">
          <h3>{t('Hisob tuzilishi')}</h3>
          <p className="yordam">{t("amoCRM dan jonli o'qildi. SotuvAI hozircha amoCRM ga hech narsa yozmaydi.")}</p>
          {tuzilishXato && <div className="xato-qator">{tuzilishXato}</div>}
          {!tuzilish && !tuzilishXato && <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>}
          {tuzilish && <Tuzilish d={tuzilish} />}
        </div>
      )}
    </section>
  );
}

function Tuzilish({ d }: { d: AmoTuzilish }) {
  const t = useT();
  const faol = d.users.filter((u) => u.isActive);
  const bosqichlar = d.pipelines.reduce((n, p) => n + p.statuses.length, 0);
  return (
    <>
      <div className="crm-raqamlar">
        <div className="crm-raqam">
          <b>{d.pipelines.length}</b>
          <span>{t('Voronka##soni')}</span>
        </div>
        <div className="crm-raqam">
          <b>{bosqichlar}</b>
          <span>{t('Bosqich##soni')}</span>
        </div>
        <div className="crm-raqam">
          <b>{faol.length}</b>
          <span>{t('Foydalanuvchi##soni')}</span>
        </div>
        <div className="crm-raqam">
          <b>{d.leadFieldCount}</b>
          <span>{t('Sdelka maydoni')}</span>
        </div>
      </div>

      <ul className="crm-voronkalar">
        {d.pipelines.map((p) => (
          <li key={p.id} className="crm-voronka">
            <div className="crm-voronka-nom">
              {p.name}
              {p.isMain && <span className="badge navy">{t('asosiy')}</span>}
            </div>
            <ol className="crm-bosqichlar" aria-label={t('{nom} bosqichlari', { nom: p.name })}>
              {p.statuses.map((s) => (
                <li key={s.id} className={`crm-bosqich ${s.tur}`}>
                  {s.name}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>

      {d.users.length > 0 && (
        <div className="crm-foydalanuvchilar">
          <h4>{t('Foydalanuvchilar')}</h4>
          <ul>
            {d.users.map((u) => (
              <li key={u.id} className={u.isActive ? undefined : 'nofaol'}>
                {u.name}
                {u.isAdmin && <span className="crm-teg">{t('admin')}</span>}
                {!u.isActive && <span className="crm-teg">{t('nofaol')}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
