import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api';
import { useT } from '../../i18n';
import '../../pages/crm.css';

/**
 * Super admin: amoCRM "bir tugmada ulash" (OAuth) — platformadagi BITTA
 * integratsiya kalitlari. Bir marta kiritiladi; shundan keyin har mijoz
 * CRM sahifasida «amoCRM bilan ulash» ni bosib ulanadi.
 */

interface Holat {
  configured: boolean;
  clientId: string | null;
  secretHint: string | null;
  redirectUri: string;
}

const YOL = '/api/v1/admin/crm/amocrm-oauth';

export function CrmOauth() {
  const t = useT();
  const [h, setH] = useState<Holat | null>(null);
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [korinadi, setKorinadi] = useState(false);
  const [nusxa, setNusxa] = useState(false);
  const [ketmoqda, setKetmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const yukla = useCallback(async () => {
    try {
      const r = await api.get<Holat>(YOL);
      setH(r);
      setClientId(r.clientId ?? '');
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi"));
    }
  }, [t]);

  useEffect(() => {
    void yukla();
  }, [yukla]);

  const saqla = async (e: FormEvent) => {
    e.preventDefault();
    setKetmoqda(true);
    setXato(null);
    setOk(false);
    try {
      const r = await api.put<Holat>(YOL, { clientId: clientId.trim(), clientSecret: secret.trim() || null });
      setH(r);
      setSecret('');
      setOk(true);
    } catch (err) {
      setXato(err instanceof ApiError ? t(err.message) : t("Saqlab bo'lmadi"));
    } finally {
      setKetmoqda(false);
    }
  };

  const ochir = async () => {
    if (!window.confirm(t("Bir tugmada ulash o'chirilsinmi? Allaqachon ulangan mijozlarning tokeni yangilanmay qoladi."))) return;
    setXato(null);
    try {
      await api.del(YOL);
      setClientId('');
      await yukla();
    } catch (err) {
      setXato(err instanceof ApiError ? t(err.message) : t("O'chirib bo'lmadi"));
    }
  };

  if (!h) return xato ? <div className="xato-qator">{xato}</div> : <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>;

  return (
    <section className="card crm-karta" aria-labelledby="crm-oauth-nom">
      <div className="crm-karta-bosh">
        <span className="crm-logo amo" aria-hidden="true">
          amo
        </span>
        <div className="crm-karta-sarlavha">
          <h2 id="crm-oauth-nom">{t('amoCRM — bir tugmada ulash')}</h2>
          <span className="yordam">{t('Platformadagi bitta integratsiya — barcha mijozlar shu orqali ulanadi')}</span>
        </div>
        <span className={`badge ${h.configured ? 'ok' : 'kul'}`}>{h.configured ? t('sozlangan') : t('sozlanmagan')}</span>
      </div>

      <details className="crm-qollanma" open={!h.configured}>
        <summary>{t('Qanday sozlanadi?')}</summary>
        <ol>
          <li>{t('O‘z amoCRM hisobingizda amoМаркет → «⋯» → «Создать интеграцию» → «Внешняя интеграция».')}</li>
          <li>{t('«Ссылка для перенаправления» ga pastdagi manzilni aynan nusxalab qo‘ying.')}</li>
          <li>{t('«Предоставить доступ: Все» ni belgilang, nom bering (masalan «SotuvAI») va saqlang.')}</li>
          <li>{t('«Ключи и доступы» bo‘limidagi «ID интеграции» va «Секретный ключ» ni shu yerga kiriting.')}</li>
        </ol>
        <p className="yordam">
          {t('Bir nechta mijoz hisobi ulanishi uchun amoCRM redirect manzili HTTPS (SSL) bo‘lishini talab qiladi — domen ulangach, manzil o‘zi yangilanadi.')}
        </p>
      </details>

      <div className="maydon-blok">
        <label htmlFor="crm-oauth-redirect">{t('Ссылка для перенаправления (redirect URI)')}</label>
        <div className="crm-sir">
          <input id="crm-oauth-redirect" readOnly value={h.redirectUri} onFocus={(e) => e.currentTarget.select()} />
          <button
            type="button"
            className="crm-kozcha"
            aria-label={t('Nusxalash')}
            title={t('Nusxalash')}
            onClick={() => {
              void navigator.clipboard?.writeText(h.redirectUri).then(() => {
                setNusxa(true);
                setTimeout(() => setNusxa(false), 1500);
              });
            }}
          >
            {nusxa ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          </button>
        </div>
        {!h.redirectUri.startsWith('https://') && (
          <div className="yordam crm-ogoh-matn">{t('Manzil HTTPS emas — hozircha faqat bitta (o‘z) amoCRM hisobingizni ulash mumkin.')}</div>
        )}
      </div>

      <form className="crm-forma" onSubmit={(e) => void saqla(e)} autoComplete="off">
        <div className="maydon-blok">
          <label htmlFor="crm-oauth-id">{t('ID интеграции (client_id)')}</label>
          <input
            id="crm-oauth-id"
            name="sotuvai-amocrm-client-id"
            value={clientId}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            autoComplete="off"
            spellCheck={false}
            required
            maxLength={200}
            onChange={(e) => setClientId(e.target.value)}
          />
        </div>
        <div className="maydon-blok">
          <label htmlFor="crm-oauth-secret">{t('Секретный ключ (client_secret)')}</label>
          <div className="crm-sir">
            <input
              id="crm-oauth-secret"
              name="sotuvai-amocrm-client-secret"
              type="text"
              className={korinadi ? undefined : 'crm-sir-yashirin'}
              value={secret}
              placeholder={h.secretHint ?? ''}
              autoComplete="off"
              spellCheck={false}
              required={!h.configured}
              maxLength={500}
              data-lpignore="true"
              data-1p-ignore="true"
              onChange={(e) => setSecret(e.target.value)}
            />
            <button
              type="button"
              className="crm-kozcha"
              aria-label={korinadi ? t('Kalitni yashirish') : t("Kalitni ko'rsatish")}
              aria-pressed={korinadi}
              onClick={() => setKorinadi((v) => !v)}
            >
              {korinadi ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </button>
          </div>
          {h.configured && <div className="yordam">{t("Bo'sh qoldirsangiz saqlangan kalit ishlatiladi.")}</div>}
        </div>
        {xato && <div className="xato-qator">{xato}</div>}
        {ok && <div className="ok-qator">{t('Saqlandi')} ✓</div>}
        <div className="crm-tugmalar">
          <button type="submit" className="btn" disabled={ketmoqda || clientId.trim().length < 10 || (!h.configured && secret.trim().length < 10)}>
            {ketmoqda ? t('Saqlanmoqda…') : t('Saqlash')}
          </button>
          {h.configured && (
            <button type="button" className="btn ikkinchi crm-uzish" onClick={() => void ochir()}>
              {t("O'chirish")}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
